# Sets the TestFlight "What to Test" note (en-US) on a build that was just
# uploaded. Waits for App Store Connect to finish processing the build first.
# Ruby standard library only (the runner's Ruby); no gems.
#
# Environment: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, BUNDLE_ID,
#              MARKETING_VERSION, BUILD_NUMBER, WHAT_TO_TEST,
#              WAIT_MINUTES (optional, default 45)
require 'json'
require 'net/http'
require 'openssl'
require 'uri'

API = 'https://api.appstoreconnect.apple.com/v1'

def env!(name)
  value = ENV[name].to_s
  abort("::error::#{name} is not set") if value.empty?
  value
end

def b64url(bytes)
  [bytes].pack('m0').tr('+/', '-_').delete('=')
end

# An App Store Connect API token: ES256 JWT, valid for 15 minutes.
def token
  key = OpenSSL::PKey::EC.new(File.read(env!('ASC_KEY_PATH')))
  header = { alg: 'ES256', kid: env!('ASC_KEY_ID'), typ: 'JWT' }
  now = Time.now.to_i
  payload = { iss: env!('ASC_ISSUER_ID'), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' }
  signing_input = "#{b64url(header.to_json)}.#{b64url(payload.to_json)}"
  der = key.sign(OpenSSL::Digest.new('SHA256'), signing_input)
  # JWT wants the raw 64-byte r||s, not the DER sequence OpenSSL returns.
  raw = OpenSSL::ASN1.decode(der).value.map { |n| n.value.to_s(2).rjust(32, "\x00".b) }.join
  "#{signing_input}.#{b64url(raw)}"
end

def request(method, path, body = nil)
  uri = URI(path.start_with?('http') ? path : "#{API}#{path}")
  req = Net::HTTP.const_get(method).new(uri)
  req['Authorization'] = "Bearer #{token}"
  req['Content-Type'] = 'application/json'
  req.body = body.to_json if body
  res = Net::HTTP.start(uri.host, uri.port, use_ssl: true) { |http| http.request(req) }
  unless res.is_a?(Net::HTTPSuccess)
    abort("::error::App Store Connect #{method.upcase} #{uri.path} answered #{res.code}: #{res.body.to_s[0, 600]}")
  end
  res.body.to_s.empty? ? {} : JSON.parse(res.body)
end

bundle_id = env!('BUNDLE_ID')
version = env!('MARKETING_VERSION')
build_number = env!('BUILD_NUMBER')
note = env!('WHAT_TO_TEST')
deadline = Time.now + Integer(ENV.fetch('WAIT_MINUTES', '45')) * 60

app = request(:Get, "/apps?filter[bundleId]=#{URI.encode_www_form_component(bundle_id)}&limit=1")['data'].first
abort("::error::No App Store Connect app has the bundle ID #{bundle_id}") unless app

build = nil
loop do
  query = "/builds?filter[app]=#{app['id']}&filter[version]=#{URI.encode_www_form_component(build_number)}" \
          "&filter[preReleaseVersion.version]=#{URI.encode_www_form_component(version)}&limit=1"
  build = request(:Get, query)['data'].first
  state = build && build.dig('attributes', 'processingState')
  puts "Build #{version} (#{build_number}): #{state || 'not visible yet'}"
  break if state == 'VALID'
  abort("::error::App Store Connect marked the build #{state}. Check the email Apple sent to the account holder.") if %w[FAILED INVALID].include?(state)
  abort("::error::The build was not processed within #{ENV.fetch('WAIT_MINUTES', '45')} minutes. Set the note by hand in App Store Connect > TestFlight.") if Time.now > deadline
  sleep 30
end

existing = request(:Get, "/builds/#{build['id']}/betaBuildLocalizations")['data']
en = existing.find { |l| l.dig('attributes', 'locale') == 'en-US' }
if en
  request(:Patch, "/betaBuildLocalizations/#{en['id']}",
          { data: { type: 'betaBuildLocalizations', id: en['id'], attributes: { whatsNew: note } } })
else
  request(:Post, '/betaBuildLocalizations',
          { data: { type: 'betaBuildLocalizations',
                    attributes: { locale: 'en-US', whatsNew: note },
                    relationships: { build: { data: { type: 'builds', id: build['id'] } } } } })
end
puts "Set the What to Test note on #{version} (#{build_number})."
