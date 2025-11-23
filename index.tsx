
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI integration for the travel assistant app.
 * This replaces the Gemini AI integration with OpenAI's GPT models.
 */

import OpenAI from 'openai';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {ChatState, MapApp, marked} from './map_app';
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
    *   Provide information about destinations, attractions, and travel tips.
5.  **Booking Assistance:**
    *   When a user asks to "book" or "reserve", suggest official websites or booking platforms.

**Tone:**
Enthusiastic, knowledgeable, and organized. Act like a travel guide showing someone their dream vacation.`;

// Convert MCP tools to OpenAI function format
async function getMcpToolsAsOpenAIFunctions(mcpClient: Client) {
  const tools = await mcpClient.listTools();
  
  return tools.tools.map((tool: any) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }));
}

function camelCaseToDash(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

document.addEventListener('DOMContentLoaded', async (event) => {
  const rootElement = document.querySelector('#root')! as HTMLElement;

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
  
  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true, // Required for browser usage
  });

  // Get MCP tools in OpenAI format
  const tools = await getMcpToolsAsOpenAIFunctions(mcpClient);
  
  // Conversation history
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_INSTRUCTIONS }
  ];

  mapApp.sendMessageHandler = async (input: string, role: string) => {
    console.log('sendMessageHandler', input, role);

    const {thinkingElement, textElement, thinkingContainer} = mapApp.addMessage(
      'assistant',
      '',
    );

    mapApp.setChatState(ChatState.GENERATING);
    textElement.innerHTML = '...';

    let newCode = '';

    try {
      // Add user message to history
      messages.push({ role: 'user', content: input });

      // Call OpenAI with streaming
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o-mini', // or 'gpt-4o' for better quality
        messages: messages,
        tools: tools,
        stream: true,
      });

      let assistantMessage = '';
      let toolCalls: any[] = [];
      let currentToolCall: any = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          mapApp.setChatState(ChatState.EXECUTING);
          assistantMessage += delta.content;
          newCode += delta.content;
          textElement.innerHTML = await marked.parse(newCode);
          mapApp.scrollToTheEnd();
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index !== undefined) {
              if (!toolCalls[toolCall.index]) {
                toolCalls[toolCall.index] = {
                  id: toolCall.id || '',
                  type: 'function',
                  function: {
                    name: toolCall.function?.name || '',
                    arguments: '',
                  },
                };
              }
              
              if (toolCall.function?.arguments) {
                toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
              }
            }
          }
        }
      }

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        // Add assistant message with tool calls to history
        messages.push({
          role: 'assistant',
          content: assistantMessage || null,
          tool_calls: toolCalls,
        });

        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const functionArgs = JSON.parse(toolCall.function.arguments);

          console.log('FUNCTION CALL:', functionName, functionArgs);

          const explanation =
            'Calling function:\n```json\n' +
            JSON.stringify({ name: functionName, arguments: functionArgs }, null, 2) +
            '\n```';
          const {textElement: functionCallText} = mapApp.addMessage(
            'assistant',
            '',
          );
          functionCallText.innerHTML = await marked.parse(explanation);

          // Call MCP tool
          try {
            const result = await mcpClient.callTool({
              name: functionName,
              arguments: functionArgs,
            });

            // Add tool result to history
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
            });
          } catch (error) {
            console.error('Tool call error:', error);
            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error: ${error}`,
            });
          }
        }

        // Get final response after tool execution
        const finalStream = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages,
          stream: true,
        });

        let finalResponse = '';
        for await (const chunk of finalStream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.content) {
            finalResponse += delta.content;
            textElement.innerHTML = await marked.parse(finalResponse);
            mapApp.scrollToTheEnd();
          }
        }

        // Add final response to history
        messages.push({ role: 'assistant', content: finalResponse });
      } else {
        // No tool calls, just add the response to history
        messages.push({ role: 'assistant', content: assistantMessage });
      }

      // Handle narration if requested
      if (mapApp.shouldSpeakNextResponse && (newCode || assistantMessage)) {
        mapApp.speak(newCode || assistantMessage);
        mapApp.shouldSpeakNextResponse = false;
      }

    } catch (e: unknown) {
      console.error('OpenAI Error:', e);
      let errorMessage = 'An error occurred';

      if (e instanceof Error) {
        errorMessage = e.message;
      } else if (typeof e === 'string') {
        errorMessage = e;
      }

      const {textElement: errorTextElement} = mapApp.addMessage('error', '');
      errorTextElement.innerHTML = await marked.parse(`Error: ${errorMessage}`);
    } finally {
      if (thinkingContainer && thinkingContainer.hasAttribute('open')) {
        thinkingContainer.classList.add('hidden');
        thinkingContainer.removeAttribute('open');
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

      mapApp.setChatState(ChatState.IDLE);
    }
  };
});
