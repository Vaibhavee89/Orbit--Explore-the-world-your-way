
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file defines and runs an MCP (Model Context Protocol) server.
 * The server exposes tools that an AI model (like Gemini) can call to interact
 * with Google Maps functionality. These tools include:
 * - `view_location_google_maps`: To display a specific location.
 * - `directions_on_google_maps`: To get and display directions.
 * - `add_to_bucket_list`: To save a location to the user's list.
 * - `remove_from_bucket_list`: To remove a location.
 *
 * When the AI decides to use one of these tools, the MCP server receives the
 * call and then uses the `mapQueryHandler` callback to send the relevant
 * parameters (location, origin/destination) to the frontend
 * (MapApp component in map_app.ts) to update the map display.
 */

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {z} from 'zod';

export interface MapParams {
  command: 'VIEW' | 'DIRECTIONS' | 'ADD_BUCKET' | 'REMOVE_BUCKET' | 'EXPLORE' | 'ORBIT';
  location?: string;
  origin?: string;
  destination?: string;
  notes?: string;
}

export async function startMcpGoogleMapServer(
  transport: Transport,
  /**
   * Callback function provided by the frontend (index.tsx) to handle map updates.
   */
  mapQueryHandler: (params: MapParams) => void,
) {
  // Create an MCP server
  const server = new McpServer({
    name: 'AI Studio Google Map',
    version: '1.0.0',
  });

  server.tool(
    'view_location_google_maps',
    'View a specific query or geographical location and display in the embedded maps interface',
    {query: z.string()},
    async ({query}) => {
      mapQueryHandler({command: 'VIEW', location: query});
      return {
        content: [{type: 'text', text: `Navigating to: ${query}`}],
      };
    },
  );

  server.tool(
    'directions_on_google_maps',
    'Search google maps for directions from origin to destination.',
    {origin: z.string(), destination: z.string()},
    async ({origin, destination}) => {
      mapQueryHandler({command: 'DIRECTIONS', origin, destination});
      return {
        content: [
          {type: 'text', text: `Navigating from ${origin} to ${destination}`},
        ],
      };
    },
  );

  server.tool(
    'add_to_bucket_list',
    'Add a specific location to the user\'s bucket list. Use this when the user expresses a desire to visit somewhere or explicitly asks to save it.',
    {location: z.string(), notes: z.string().optional()},
    async ({location, notes}) => {
      mapQueryHandler({command: 'ADD_BUCKET', location, notes});
      return {
        content: [{type: 'text', text: `Added ${location} to bucket list.`}],
      };
    },
  );

  server.tool(
    'remove_from_bucket_list',
    'Remove a location from the user\'s bucket list.',
    {location: z.string()},
    async ({location}) => {
      mapQueryHandler({command: 'REMOVE_BUCKET', location});
      return {
        content: [{type: 'text', text: `Removed ${location} from bucket list.`}],
      };
    },
  );

  server.tool(
    'enter_exploration_mode',
    'Enter First-Person Exploration Mode. Use this when the user wants to "explore", "walk around", or "see what it is like" at the current location.',
    {},
    async () => {
        mapQueryHandler({command: 'EXPLORE'});
        return {
            content: [{type: 'text', text: 'Entering virtual exploration mode.'}]
        };
    }
  );

  server.tool(
    'start_orbit',
    'Start rotating the camera 360 degrees around the current location to get a full view of the surroundings.',
    {},
    async () => {
        mapQueryHandler({command: 'ORBIT'});
        return {
            content: [{type: 'text', text: 'Starting 360 degree orbit.'}]
        };
    }
  );

  await server.connect(transport);
  console.log('server running');
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
