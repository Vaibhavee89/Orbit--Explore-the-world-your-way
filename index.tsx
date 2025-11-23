
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This is the main entry point for the application.
 * It sets up the LitElement-based MapApp component, initializes the Google GenAI
 * client for chat interactions, and establishes communication between the
 * Model Context Protocol (MCP) client and server. The MCP server exposes
 * map-related tools that the AI model can use, and the client relays these
 * tool calls to the server.
 */

import {GoogleGenAI, mcpToTool} from '@google/genai';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {ChatState, MapApp, marked} from './map_app'; // Updated import path
import {MapParams, startMcpGoogleMapServer} from './mcp_maps_server';

/* --------- */

async function startClient(transport: Transport) {
  const client = new Client({name: 'AI Studio', version: '1.0.0'});
  await client.connect(transport);
  return client;
}

/* ------------ */

const SYSTEM_INSTRUCTIONS = `You are an expert Travel Planner and Bucket List Manager with the ability to guide users through Virtual Exploration.
Your goal is to help users discover amazing places, visualize them on the 3D map, and curate their personal "Bucket List" of dream destinations.

**Core Responsibilities:**
1.  **Visualization:** When a user asks about a place, ALWAYS use 'view_location_google_maps' to show it to them immediately.
2.  **Virtual Exploration:**
    *   If a user asks to "explore", "walk around", "start tour", or "enter street view", use the 'enter_exploration_mode' tool.
    *   If a user asks to "look around", "spin", "orbit", or "show me the surroundings", use the 'start_orbit' tool.
    *   While exploring, if the user asks "What is this?", act as a tour guide explaining the visible landmarks.
3.  **List Management:**
    *   If a user says "I want to go there", "Add this to my list", or "Save this", use the 'add_to_bucket_list' tool.
4.  **Inspiration & Planning:**
    *   Use **Google Search** to find "relevant information available on the internet" about destinations.
    *   Use **Google Maps Grounding** to find highly rated places nearby.
5.  **Booking Assistance:**
    *   When a user asks to "book" or "reserve", use **Google Search** to find official websites.

**Tone:**
Enthusiastic, knowledgeable, and organized. Act like a travel guide showing someone their dream vacation.
`;

const ai = new GoogleGenAI({
  apiKey: process.env.API_KEY,
});

function createAiChat(mcpClient: Client) {
  return ai.chats.create({
    model: 'gemini-1.5-pro',
    config: {
      systemInstruction: SYSTEM_INSTRUCTIONS,
      tools: [
        mcpToTool(mcpClient),
        { googleSearch: {} },
        { googleMaps: {} }
      ],
    },
  });
}

function camelCaseToDash(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

document.addEventListener('DOMContentLoaded', async (event) => {
  const rootElement = document.querySelector('#root')! as HTMLElement;

  // Use double casting to unknown to bypass TypeScript structural incompatibility errors
  const mapApp = document.createElement('gdm-map-app') as unknown as MapApp;
  rootElement.appendChild(mapApp as unknown as Node);

  const [transportA, transportB] = InMemoryTransport.createLinkedPair();

  void startMcpGoogleMapServer(
    transportA,
    (params: MapParams) => {
      mapApp.handleMapQuery(params);
    },
  );

  const mcpClient = await startClient(transportB);
  const aiChat = createAiChat(mcpClient);

  mapApp.sendMessageHandler = async (input: string, role: string) => {
    console.log('sendMessageHandler', input, role);

    const {thinkingElement, textElement, thinkingContainer} = mapApp.addMessage(
      'assistant',
      '',
    );

    mapApp.setChatState(ChatState.GENERATING);
    textElement.innerHTML = '...'; // Initial placeholder

    let newCode = '';
    let thoughtAccumulator = '';
    const uniqueSources = new Map<string, string>(); // url -> title

    try {
      // Outer try for overall message handling including post-processing
      try {
        // Inner try for AI interaction and message parsing
        const stream = await aiChat.sendMessageStream({message: input});

        for await (const chunk of stream) {
          for (const candidate of chunk.candidates ?? []) {
            
            // Capture Grounding Metadata (Search Results)
            if (candidate.groundingMetadata?.groundingChunks) {
                candidate.groundingMetadata.groundingChunks.forEach((c: any) => {
                    if (c.web?.uri && c.web?.title) {
                        uniqueSources.set(c.web.uri, c.web.title);
                    }
                    // Maps grounding chunks (c.maps) are handled by the model text generation usually,
                    // but we could extract them here if we wanted specific place IDs.
                });
            }

            for (const part of candidate.content?.parts ?? []) {
              if (part.functionCall) {
                console.log(
                  'FUNCTION CALL:',
                  part.functionCall.name,
                  part.functionCall.args,
                );
                const mcpCall = {
                  name: camelCaseToDash(part.functionCall.name!),
                  arguments: part.functionCall.args,
                };

                const explanation =
                  'Calling function:\n```json\n' +
                  JSON.stringify(mcpCall, null, 2) +
                  '\n```';
                const {textElement: functionCallText} = mapApp.addMessage(
                  'assistant',
                  '',
                );
                functionCallText.innerHTML = await marked.parse(explanation);
              }

              if (part.thought) {
                mapApp.setChatState(ChatState.THINKING);
                thoughtAccumulator += ' ' + part.thought;
                thinkingElement.innerHTML =
                  await marked.parse(thoughtAccumulator);
                if (thinkingContainer) {
                  thinkingContainer.classList.remove('hidden');
                  thinkingContainer.setAttribute('open', 'true');
                }
              } else if (part.text) {
                mapApp.setChatState(ChatState.EXECUTING);
                newCode += part.text;
                textElement.innerHTML = await marked.parse(newCode);
              }
              mapApp.scrollToTheEnd();
            }
          }
        }

        // If narration was requested, speak the result now that it is complete
        if (mapApp.shouldSpeakNextResponse && newCode) {
            mapApp.speak(newCode);
            mapApp.shouldSpeakNextResponse = false;
        }

      } catch (e: unknown) {
        // Catch for AI interaction errors.
        console.error('GenAI SDK Error:', e);
        let baseErrorText: string;

        if (e instanceof Error) {
          baseErrorText = e.message;
        } else if (typeof e === 'string') {
          baseErrorText = e;
        } else if (
          e &&
          typeof e === 'object' &&
          'message' in e &&
          typeof (e as {message: unknown}).message === 'string'
        ) {
          baseErrorText = (e as {message: string}).message;
        } else {
          try {
            // Attempt to stringify complex objects, otherwise, simple String conversion.
            baseErrorText = `Unexpected error: ${JSON.stringify(e)}`;
          } catch (stringifyError) {
            baseErrorText = `Unexpected error: ${String(e)}`;
          }
        }

        let finalErrorMessage = baseErrorText; // Start with the extracted/formatted base error message.

        // Attempt to parse a JSON object from the baseErrorText, as some SDK errors embed details this way.
        // This is useful if baseErrorText itself is a string containing JSON.
        const jsonStartIndex = baseErrorText.indexOf('{');
        const jsonEndIndex = baseErrorText.lastIndexOf('}');

        if (jsonStartIndex > -1 && jsonEndIndex > jsonStartIndex) {
          const potentialJson = baseErrorText.substring(
            jsonStartIndex,
            jsonEndIndex + 1,
          );
          try {
            const sdkError = JSON.parse(potentialJson);
            let refinedMessageFromSdkJson: string | undefined;

            // Check for common nested error structures (e.g., sdkError.error.message)
            // or a direct message (sdkError.message) in the parsed JSON.
            if (
              sdkError &&
              typeof sdkError === 'object' &&
              sdkError.error && // Check if 'error' property exists and is truthy
              typeof sdkError.error === 'object' && // Check if 'error' property is an object
              typeof sdkError.error.message === 'string' // Check for 'message' string within 'error' object
            ) {
              refinedMessageFromSdkJson = sdkError.error.message;
            } else if (
              sdkError &&
              typeof sdkError === 'object' && // Check if sdkError itself is an object
              typeof sdkError.message === 'string' // Check for a direct 'message' string on sdkError
            ) {
              refinedMessageFromSdkJson = sdkError.message;
            }

            if (refinedMessageFromSdkJson) {
              finalErrorMessage = refinedMessageFromSdkJson; // Update if JSON parsing yielded a more specific message
            }
          } catch (parseError) {
            // If parsing fails, finalErrorMessage remains baseErrorText.
            console.warn(
              'Could not parse potential JSON from error message; using base error text.',
              parseError,
            );
          }
        }

        const {textElement: errorTextElement} = mapApp.addMessage('error', '');
        errorTextElement.innerHTML = await marked.parse(
          `Error: ${finalErrorMessage}`,
        );
      }

      // Post-processing logic (now inside the outer try)
      if (thinkingContainer && thinkingContainer.hasAttribute('open')) {
        if (!thoughtAccumulator) {
          thinkingContainer.classList.add('hidden');
        }
        thinkingContainer.removeAttribute('open');
      }

      // Append collected Sources if any
      if (uniqueSources.size > 0) {
        let sourcesHtml = '<div class="grounding-sources"><h3>Sources:</h3><div class="source-chips">';
        uniqueSources.forEach((title, uri) => {
            sourcesHtml += `<a href="${uri}" target="_blank" class="source-chip" title="${title}">${title}</a>`;
        });
        sourcesHtml += '</div></div>';
        textElement.innerHTML += sourcesHtml;
      }

      if (
        textElement.innerHTML.trim() === '...' ||
        textElement.innerHTML.trim().length === 0
      ) {
        const hasFunctionCallMessage = mapApp.messages.some((el) =>
          el.innerHTML.includes('Calling function:'),
        );
        if (!hasFunctionCallMessage) {
          textElement.innerHTML = await marked.parse('Done.');
        } else if (textElement.innerHTML.trim() === '...') {
          textElement.innerHTML = '';
        }
      }
    } finally {
      // Finally for the outer try, ensures chat state is reset
      mapApp.setChatState(ChatState.IDLE);
    }
  };
});
