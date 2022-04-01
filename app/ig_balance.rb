# frozen_string_literal: true

require 'functions_framework'
require 'stripe'
require 'json'

AUTHORIZED_POSTAL_CODES = %w[
  98222
  98243
  98245
  98250
  98261
  98279
  98280
  98286
  98297
].freeze

FUNDING_TRAUNCHES = {
  funding_traunch_initial: 150,
  funding_traunch_second_refill: 75
}.freeze

FUNDING_TRAUNCHES_LOGIC = {
  funding_traunch_second_refill: lambda { |c|
    ls = lifetime_spent(c)
    ls > FUNDING_TRAUNCHES[:funding_traunch_initial] * 0.75
  }
}.freeze

NETWORK_ID_PASSTHROUGH_EXCEPTIONS = [
  '628044003838794' # TERRA FLEURS; based in seattle but sometimes sells at the local farmers market
].freeze

class MissingParamsError < StandardError; end

FunctionsFramework.on_startup do |_function|
  Stripe.api_key   = ENV['STRIPE_API_KEY']
  Stripe.log_level = Stripe::LEVEL_INFO
  Stripe.logger    = FunctionsFramework.logger
end

FunctionsFramework.http 'setup_defaults' do |_request|
  Stripe.log_level = Stripe::LEVEL_ERROR
  ch_counter = update_spending_limits!(Stripe::Issuing::Cardholder)
  logger.info "Successfully updated #{ch_counter} cardholders"

  c_counter = update_spending_limits!(Stripe::Issuing::Card)
  logger.info "Successfully updated #{c_counter} cards"
  logger.info "FINISHED: Updated #{ch_counter} cardholders and #{c_counter} cards"
  return [200, {}, ["Updated #{ch_counter} cardholders and #{c_counter} cards"]]
end

FunctionsFramework.http 'cc_authorization_webhook' do |request|
  logger.debug "params: #{request.params}"
  event = retrieve_webhook_event(request)
  return [400, {}, []] unless event

  logger.debug "event: #{event}"
  return [204, {}, []] unless event['type'] == 'issuing_authorization.request' ||
                              event['type'] == 'issuing_authorization.created'

  auth = event['data']['object']
  handle_authorization(auth)
  return [200, {}, []]
rescue StandardError => e
  logger.error e
  return [400, {}, []]
end

# for Stripe cards, specifically to:
#  - check remaining balance
#  - show transactions
FunctionsFramework.http 'balance_check' do |request|
  logger.debug "params: #{request.params}"
  verify_params!(request)
  card = retrieve_card!(request)
  return [204, {}, []] unless card && card.status == 'active' && card.livemode?

  output = balance_info(card)
  response_json = request.params['pretty'] ? JSON.pretty_generate(output) : output.to_json
  [200, { 'Content-Type' => 'application/json' }, [response_json]]
rescue MissingParamsError => e
  return [400, {}, [e.message]]
end

private

def handle_authorization(auth)
  # Authorize the transaction
  # authorization =
  Stripe::Issuing::Authorization.approve(auth['id'])
  logger.info "MERCHANT DATA: #{auth['merchant_data']}"
  logger.info "within postal_code: #{AUTHORIZED_POSTAL_CODES.include? auth['merchant_data']['postal_code']}"
  # auth['merchant_data']['country'] == 'US'
  ## Stripe::Issuing::Authorization.decline(auth['id'])
end

def retrieve_webhook_event(request)
  payload = request.body.read
  sig_header = request.env['HTTP_STRIPE_SIGNATURE']

  Stripe::Webhook.construct_event(
    payload, sig_header, ENV['STRIPE_AUTH_WEBHOOK_SECRET']
  )
  # rescue JSON::ParserError => e
  #   # Invalid payload.
  # rescue Stripe::SignatureVerificationError => e
  #   # Invalid signature.
end

def retrieve_card_by_email(email)
  email ||= ''
  return nil if email.strip.empty?

  cardholder = Stripe::Issuing::Cardholder.list(email: email).first
  return nil unless cardholder && cardholder.status == 'active' && cardholder.livemode?

  Stripe::Issuing::Card.list(cardholder: cardholder.id).first
end

def retrieve_card_by_last4_exp(last4, exp_month, exp_year)
  last4 ||= ''
  exp_month ||= ''
  exp_year  ||= ''
  return nil if last4.strip.empty? || exp_month.strip.empty? || exp_year.strip.empty?

  Stripe::Issuing::Card.list(
    last4: last4,
    exp_month: exp_month,
    exp_year: exp_year
  ).first
end

def verify_min_card_params!(request)
  return if request.params['email'] && !request.params['email'].strip.empty?

  missing_params = []
  %w[last4 exp_month exp_year].each do |required_param|
    if request.params[required_param].nil? || request.params[required_param].strip.empty?
      missing_params << required_param
    end
  end
  return if missing_params.empty?

  msg = missing_params.size < 2 ? 'is a required parameter' : 'are required parameters'
  raise MissingParamsError, "'#{missing_params.join("', '")}' #{msg}."
end

def retrieve_card!(request)
  verify_min_card_params!(request)
  retrieve_card_by_email(request.params['email']) ||
    retrieve_card_by_last4_exp(request.params['last4'], request.params['exp_month'], request.params['exp_year'])
end

def verify_params!(request)
  return if request.params['email'] && !request.params['email'].strip.empty?

  missing_params = []
  %w[last4 exp_month exp_year].each do |required_param|
    if request.params[required_param].nil? || request.params[required_param].strip.empty?
      missing_params << required_param
    end
  end
  return if missing_params.empty?

  msg = missing_params.size < 2 ? 'is a required parameter' : 'are required parameters'
  raise MissingParamsError, "'#{missing_params.join("', '")}' #{msg}."
end

def balance_info(card)
  output = {
    spending_limit: current_all_time_spending_limit(card),
    total_spent: 0.0,
    remaining_amt: 0.0,
    authorizations: []
  }

  Stripe::Issuing::Authorization.list(card: card.id).auto_paging_each do |a|
    auth = {
      approved: a.approved?,
      amount: (a.amount.to_f / 100).round(2),
      merchant: a.merchant_data.to_hash.slice(:name, :city, :state, :postal_code),
      created_at: a.created
    }
    if auth[:approved]
      output[:total_spent] += auth[:amount]
    else
      auth[:reason_rejected] = a.request_history.first.reason
    end

    output[:authorizations] << auth
  end
  output[:remaining_amt] = (output[:spending_limit] - output[:total_spent]).round(2)
  output
end

def lifetime_spent(card)
  # auths = []
  args = card.is_a?(Stripe::Issuing::Cardholder) ? { cardholder: card.id } : { card: card.id }
  approved_auths = Stripe::Issuing::Authorization.list(args).auto_paging_each.find_all(&:approved?)
  # Stripe::Issuing::Authorization.list(args).auto_paging_each { |a| auths << a if a.approved? }
  approved_auths.sum(&:amount).to_f / 100
end

def current_all_time_spending_limit(card)
  sl = card.spending_controls.spending_limits.find { |l| l.interval == 'all_time' }
  sl ? sl.amount.to_f / 100 : 0
end

def calculate_spending_limit(card)
  spending_limit = 0
  traunches = applied_funding_traunches(card)
  FUNDING_TRAUNCHES.each_pair do |k, v|
    spending_limit += v if traunches[k]
  end
  spending_limit
end

def applied_funding_traunches(card)
  applied_traunches = {}
  FUNDING_TRAUNCHES.each do |k, v|
    applied_traunches[k] = v if !FUNDING_TRAUNCHES_LOGIC[k] || FUNDING_TRAUNCHES_LOGIC[k].call(card)
  end
  applied_traunches
end

def update_spending_limits!(klass)
  counter = 0
  klass.list.auto_paging_each do |obj|
    spending_limit = calculate_spending_limit(obj)
    next if spending_limit == current_all_time_spending_limit(obj)

    klass.update(obj.id,
                 metadata: obj.metadata.to_h.merge(applied_funding_traunches(obj)),
                 spending_controls: {
                   spending_limits: [{ amount: (spending_limit * 100).to_i,
                                       interval: 'all_time' }]
                 })

    counter += 1
  end
  counter
end
