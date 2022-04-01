# frozen_string_literal: true

source 'https://rubygems.org'

# Include the Ruby Functions Framework as a dependency.
gem 'functions_framework', '~> 0.5'
gem 'stripe',              '~> 5'

group :development, :test do
  gem 'pry'
  gem 'rspec'
  gem 'faker', '~> 2.11.0'
  gem 'rspec_junit_formatter'
  # Rubocop changes pretty quickly: new cops get added and old cops change
  # names or go into new namespaces. This is a library and we don't have
  # `Gemfile.lock` checked in, so to prevent good builds from suddenly going
  # bad, pin to a specific version number here. Try to keep this relatively
  # up-to-date, but it's not the end of the world if it's not.
  gem 'rubocop', '~> 1.22', require: false
end
