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

# NETWORK_ID_PASSTHROUGH_EXCEPTIONS = [
#   '628044003838794', # TERRA FLEURS; based in seattle but sometimes sells at the local farmers market
#   '188418000053360', # SQ *LUM FARM LLC
#   '188418000053360', # SQ *GIRL MEETS DIRT
#   '188418000053360', # SQ *SAN JUAN ISLAND SEA S
#   '445301504996',    # SQ *LUM FARM LLC
#   '445301504996',    # SQ *NORTH BEACH MUS
#   '445301504996',    # SQ *WATMOUGH BAY FA
#   '068500500011SH1', # ISLAND MARKET
#   '739294125301424', # SAN JUAN ISLANDS FOOD HUB
#   '374254102881',    # ORCAS FOOD COOP
#   '242661000053360', # SQ *NOOTKA ROSE FARM -- DUP?
#   '242661000053360', # SQ *AURORA FARMS  -- DUP?
#   '242661000053360', # SQ *WESTBEACH FARM
#   '242661000053360', # SQ *MORNING STAR FARM
#   '242661000053360', # SQ *SUNNYFIELD FARM
#   '242661000053360', # SQ *WOW FARM LLC
#   '242661000053360', # SQ *JOON FARM
#   '242661000053360', # SQ *NORTH STAR FARM FARMS
#   '242661000053360', # SQ *WATMOUGH BAY FARM LLC
#   '242661000053360', # SQ *LOPEZ VILLAGE FARM
#   '242661000053360', # SQ *BARN OWL BAKERY
#   '517924500086012', # SAN JUAN ISLAND FOOD CO-O
#   '000100216378883', # THE STAND
#   '068548600011SH1', # ORCAS VILLAGE STORE
#   '628042006800254', # ISLAND SKILLET
#   '242660000053360', # SQ *STONECREST FARM & GRA
#   '000776201145880', # AMARO FARM
#   '053894000053360', # SQ *BUCK BAY SHELLFISH FA
# ].freeze

ALLOWED_VENDOR_NAMES = {
  "ORCAS FOOD COOP" => 98245,
  "SAN JUAN ISLAND FOOD" => 98250,
  "San Juan Islands Food Hub" => 98250,
  "SQ *AURORA FARMS" => 98250,
  "SQ *BARN OWL BAKERY" => 98261,
  "BARN OWL BAKERY INC" => 98261,
  "SQ *BUCK BAY SHELLFISH" => 98279,
  "SQ *GIRL MEETS DIRT" => 98245,
  "SQ *JOON FARM" => 98250,
  "SQ *KARI'S ISLAND ELIXIRS" => 98250,
  "SQ *LOPEZ VILLAGE FARM" => 98261,
  "SQ *LUM FARM LLC" => 98245,
  "SQ *MAMA BIRD FARM" => 98250,
  "SQ *MORNING STAR FARM" => 98280,
  "SQ *NOOTKA ROSE FARM" => 98245,
  "SQ *NORTH BEACH MUSHROOMS" => 98245,
  "SQ *NORTH STAR FARM FA" => 98261,
  "SQ *ROCHE HARBOR FARM" => 98250,
  "SQ *SAN JUAN ISLAND SE" => 98250,
  "SQ *STONECREST FARM &" => 98261,
  "SQ *SUNNYFIELD FARM" => 98261,
  "SQ *URSA MINOR" => 98261,
  "SQ *WATMOUGH BAY FARM" => 98261,
  "SQ *WESTBEACH FARM" => 98245,
  "SQ *WOW FARM LLC" => 98279,
  "TERRA FLEURS" => 98122
}.freeze








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
  cards = retrieve_cards!(request)
  return [204, {}, []] unless !cards.empty? && cards.first.status == 'active' && cards.first.livemode?

  output = balance_info(cards)
  response_json = request.params['pretty'] ? JSON.pretty_generate(output) : output.to_json
  [200, { 'Content-Type' => 'application/json' }, [response_json]]
rescue MissingParamsError => e
  return [400, {}, [e.message]]
end

private

def handle_authorization(auth)
  logger.info "MERCHANT DATA: #{auth['merchant_data']}"
  # logger.info "within postal_code: #{AUTHORIZED_POSTAL_CODES.include? auth['merchant_data']['postal_code']}"
  found_vn = ALLOWED_VENDOR_NAMES.keys.select{|vn| auth['merchant_data']['name'].match(/#{Regexp.escape(vn)}/i)}.first
  verified_vendor = false
  if found_vn
    verified_vendor = ALLOWED_VENDOR_NAMES[found_vn] && ALLOWED_VENDOR_NAMES[found_vn].to_s === auth['merchant_data']['postal_code']
    verified_vendor ||= AUTHORIZED_POSTAL_CODES.include?(auth['merchant_data']['postal_code'])
  end
  logger.info "found vn: #{found_vn} -- verified_vendor: #{verified_vendor}"
  if verified_vendor
    auth_response = Stripe::Issuing::Authorization.approve(auth['id'])
    logger.info auth_response
  else
   auth_response = Stripe::Issuing::Authorization.decline(auth['id'],
      metadata: { reason: "not a verified vendor",
                  vendor_found: "#{found_vn || false}",
                  vendor_postal_code: auth['merchant_data']['postal_code'],
                  mapped_postal_code: "#{ALLOWED_VENDOR_NAMES[found_vn] || false}",
                  within_authorized_postal_code: AUTHORIZED_POSTAL_CODES.include?(auth['merchant_data']['postal_code'])
                }
    )
    logger.info auth_response
  end
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

def retrieve_cards_by_email(email)
  email ||= ''
  return [] if email.strip.empty?

  cardholder = Stripe::Issuing::Cardholder.list(email: email).first
  return [] unless cardholder && cardholder.status == 'active' && cardholder.livemode?

  card_list = Stripe::Issuing::Card.list(cardholder: cardholder.id)
  cards = []
  card_list.auto_paging_each{|c| cards << c}
  return cards
end

def retrieve_cards_by_last4_exp(last4, exp_month, exp_year)
  last4 ||= ''
  exp_month ||= ''
  exp_year  ||= ''
  return [] if last4.strip.empty? || exp_month.strip.empty? || exp_year.strip.empty?

  card_list = Stripe::Issuing::Card.list(
    last4: last4,
    exp_month: exp_month,
    exp_year: exp_year
  )
  cards = []
  card_list.auto_paging_each{|c| cards << c}
  return cards
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

def retrieve_cards!(request)
  verify_min_card_params!(request)
  retrieve_cards_by_email(request.params['email']) ||
    retrieve_cards_by_last4_exp(request.params['last4'], request.params['exp_month'], request.params['exp_year'])
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

def balance_info(cards)
  output = {
    spending_limit: current_all_time_spending_limit(cards),
    total_spent: 0.0,
    remaining_amt: 0.0,
    authorizations: []
  }

  cards.each do |card|
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

def current_all_time_spending_limit(cards)
  sl = cards.first.spending_controls.spending_limits.find { |l| l.interval == 'all_time' }
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
