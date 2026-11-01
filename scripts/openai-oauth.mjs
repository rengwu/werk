import { dirname } from 'node:path';
// pi-ai deliberately hides Node OAuth imports from bundlers. Include only the
// selected SDK flow; its login, callback validation and refresh code stay intact.
export const openAiOAuth = {
  name: 'openai-oauth',
  setup(build) {
    build.onLoad({ filter: /auth[\\/]oauth[\\/]load\.js$/ }, async args => ({
      contents: 'export async function loadOpenAIChatGPTOAuth() { return (await import("./openai-chatgpt.js")).openaiChatGPTOAuth; }',
      resolveDir: dirname(args.path), loader: 'js',
    }));
  },
};
