import { createChatService } from '../src/services/chat.service.js';
import { env } from '../src/config/env.js';

// Explicit opt-in command: uses a small amount of Gemini quota, never the database.
const hints = {
  invalid_request: 'Google rejected the request configuration. Check the selected model and thinking settings.',
  invalid_key: 'Google rejected the API key. Create a new key in Google AI Studio and update GEMINI_API_KEY.',
  access_denied: 'Check API key restrictions, project permissions, and regional availability in Google AI Studio.',
  api_disabled: 'Enable the Generative Language API for this project and check API key restrictions.',
  model_unavailable: 'GEMINI_MODEL is unavailable for this key/API. Select an available text model in Google AI Studio.',
  quota_exceeded: 'Google quota is exhausted. Check project limits in Google AI Studio.',
  service_unavailable: 'Google is temporarily unavailable or overloaded. Retry later or test another available text model using GEMINI_MODEL.',
  provider_error: 'Google returned a server error. Check the Google AI service status.',
  prompt_blocked: 'Google blocked the test prompt.',
  response_blocked: 'Google blocked the generated response.',
  output_limit: 'Generation reached its token limit before a complete reply.',
  invalid_response: 'Google returned no complete text reply in the expected format.',
  timeout: 'Google did not finish before GEMINI_TIMEOUT_MS. Try this check from your local network.',
  network_error: 'Could not reach Google. Check internet, proxy, firewall, and DNS settings.',
};
let diagnostic;
const start = Date.now();
try {
  const reply = await createChatService({ onDiagnostic: value => { diagnostic = value; } }).reply([{ role: 'USER', content: 'Say a short greeting in Armenian. One sentence only.' }]);
  console.log(`Gemini OK (${env.geminiModel}, ${Date.now() - start}ms)`);
  console.log(reply);
} catch (error) {
  console.error(`Gemini check failed: HTTP ${error.status ?? 500} (${Date.now() - start}ms)`);
  console.error(error.status ? error.message : 'Unexpected failure');
  console.error(`Model: ${env.geminiModel}`);
  if (diagnostic) {
    console.error(`Reason: ${diagnostic.category}${diagnostic.upstreamStatus ? ` (Google HTTP ${diagnostic.upstreamStatus})` : ''}`);
    console.error(hints[diagnostic.category]);
  }
  process.exitCode = 1;
}
