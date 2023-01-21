#!/bin/zsh
set -e  # fail script on error
# set -x  # show cmds run within this script

local job_name='check-cardholders-refill'
local service_acct_name='Default compute service account'
local stripe_api_key_read_name='STRIPE_ISSUING_READ_API_KEY'
local stripe_api_key_write_name='STRIPE_ISSUING_WRITE'
local stripe_api_key_cardholder_setup_name='STRIPE_AUTH_WEBHOOK_CARDHOLDER_SETUP_SECRET'
local stripe_api_key_auth_webhook_name='STRIPE_AUTH_WEBHOOK_SECRET'

local service_acct=`gcloud iam service-accounts list --filter="${service_acct_name}" --format="json" | jq -r '.[0].email'`

local default_function_opts='--gen2 \
--runtime=nodejs18 \
--trigger-http \
--memory 256Mi \
--region us-west1 '

echo '---- Setting up ig-balance endpoint'
eval "gcloud functions deploy ig-balance ${default_function_opts} \
  --entry-point=igBalance \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 3 \
  --timeout 10 \
  --ingress-settings=all \
  --set-secrets 'STRIPE_API_KEY=${stripe_api_key_read_name}:latest'" &

echo '---- Setting up wh-twilio endpoint'
eval "gcloud functions deploy wh-twilio ${default_function_opts} \
  --entry-point=whTwilio \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 10 \
  --ingress-settings=all \
  --set-secrets 'STRIPE_API_KEY=STRIPE_ISSUING_WRITE:latest' \
  --set-secrets 'TWILIO_PHONE_NUMBER=TWILIO_PHONE_NUMBER:latest' \
  --set-secrets 'TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest' \
  --set-secrets 'TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest'" &


echo '---- Setting up wh-cardholder-setup endpoint'
eval "gcloud functions deploy wh-cardholder-setup ${default_function_opts} \
  --entry-point=whCardholderSetup \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --timeout 10 \
  --ingress-settings=all \
  --set-secrets 'STRIPE_API_KEY=${stripe_api_key_write_name}:latest' \
  --set-secrets 'STRIPE_AUTH_WEBHOOK_SECRET=${stripe_api_key_cardholder_setup_name}:latest' \
  --set-secrets 'TWILIO_PHONE_NUMBER=TWILIO_PHONE_NUMBER:latest' \
  --set-secrets 'TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest' \
  --set-secrets 'TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest'" &


echo '---- Setting up wh-authorization endpoint'
eval "gcloud functions deploy wh-authorization ${default_function_opts} \
  --entry-point=whAuthorization \
  --allow-unauthenticated \
  --min-instances 1 \
  --max-instances 4 \
  --timeout 3 \
  --ingress-settings=all \
  --set-secrets 'STRIPE_API_KEY=${stripe_api_key_write_name}:latest' \
  --set-secrets 'STRIPE_AUTH_WEBHOOK_SECRET=${stripe_api_key_auth_webhook_name}:latest' \
  --set-secrets 'TWILIO_PHONE_NUMBER=TWILIO_PHONE_NUMBER:latest' \
  --set-secrets 'TWILIO_ACCOUNT_SID=TWILIO_ACCOUNT_SID:latest' \
  --set-secrets 'TWILIO_AUTH_TOKEN=TWILIO_AUTH_TOKEN:latest'" &


echo '---- Setting up ig-update-cardholder-spending-rules endpoint'
eval "gcloud functions deploy ig-update-cardholder-spending-rules ${default_function_opts} \
  --entry-point=igUpdateCardholderSpendingRules \
  --no-allow-unauthenticated \
  --min-instances 0 \
  --max-instances 1 \
  --timeout 1200 \
  --ingress-settings=all \
  --service-account ${service_acct} \
  --set-secrets 'STRIPE_API_KEY=${stripe_api_key_write_name}:latest'" &

wait
echo '---- all function deploys finished'


local gcp_scheduler_cmd=create
local previouslyScheduled=`gcloud scheduler jobs list --location=us-west1 --filter="${job_name}" | wc -l`
if [[ $previouslyScheduled -gt 0 ]]; then
  gcp_scheduler_cmd=update
fi
local update_cardholder_spending_rules_uri=`gcloud functions describe ig-update-cardholder-spending-rules --format='json' | jq -r '.serviceConfig.uri'`

echo "---- ${gcp_scheduler_cmd}ing scheduled job"
eval "gcloud scheduler jobs ${gcp_scheduler_cmd} http ${job_name} \
  --schedule '0 1 * * *' \
  --location=us-west1 \
  --http-method=POST \
  --attempt-deadline=1800s \
  --oidc-service-account-email=${service_acct} \
  --uri=${update_cardholder_spending_rules_uri}"



# gcloud dns --project=sjfood managed-zones create island-grown --description="" --dns-name="com." --visibility="public" --dnssec-state="on" --log-dns-queries


local balance_uri=`gcloud functions describe ig-balance --format='json' | jq -r '.serviceConfig.uri'`
local auth_uri=`gcloud functions describe wh-authorization --format='json' | jq -r '.serviceConfig.uri'`
local cardholder_setup_uri=`gcloud functions describe wh-cardholder-setup --format='json' | jq -r '.serviceConfig.uri'`
local twilio_uri=`gcloud functions describe wh-twilio --format='json' | jq -r '.serviceConfig.uri'`

echo "\n\n\n------------------------------"
echo "  balance endpoint uri:                ${balance_uri}"
echo "  auth validation Stripe webhook uri:  ${auth_uri}"
echo "  cardholder setup Stripe Webhook uri: ${cardholder_setup_uri}"
echo "  twilio webhook uri:                  ${twilio_uri}"
echo "\n"
echo "  job setup for refill checks: ${job_name}"
