import OpenAI from 'openai';
import { QuestSchema, type Quest } from './Quest';
import type { WorldManifest, SelectedLocation } from '../../geospatial/WorldBuilderClient';

const client = new OpenAI({
  apiKey: typeof process !== 'undefined' ? process.env.OPENAI_API_KEY : '',
  dangerouslyAllowBrowser: true,
});

interface QuestGeneratorContext {
  world: WorldManifest;
  location: SelectedLocation;
  playerLevel: number;
  availableChallenges: string[];
}

export async function generateQuest(context: QuestGeneratorContext): Promise<Quest> {
  const { world, location, playerLevel, availableChallenges } = context;

  const prompt = `You are a creative game designer creating quests for an exploration adventure game.

World Information:
- Location: ${location.label}
- Bounding box: N ${location.box.north.toFixed(4)}° S ${location.box.south.toFixed(4)}° E ${location.box.east.toFixed(4)}° W ${location.box.west.toFixed(4)}°
- Size: ${location.box.widthM}m × ${location.box.heightM}m
- Stats: ${JSON.stringify(world.stats)}

Player Level: ${playerLevel}
Available Challenges: ${availableChallenges.join(', ')}

Generate ONE quest as a JSON object with this structure:
{
  "id": "quest_<random>",
  "title": "<compelling quest title>",
  "description": "<narrative description that matches the real location>",
  "objective": "<what the player needs to do>",
  "reward": {
    "xp": <number 50-200>,
    "items": ["<item_id>"]
  },
  "difficulty": "easy" | "medium" | "hard",
  "location": {
    "x": <0-${location.box.widthM}>,
    "y": <0-50>,
    "z": <0-${location.box.heightM}>
  },
  "tags": ["<tag1>", "<tag2>"]
}

Return ONLY valid JSON, no markdown.`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Expected text response from Claude');

    const jsonStr = content.text.trim();
    const questData = JSON.parse(jsonStr);
    const quest = QuestSchema.parse(questData);

    return quest;
  } catch (err) {
    console.error('[QuestGenerator] Error:', err);
    throw new Error(`Failed to generate quest: ${err instanceof Error ? err.message : String(err)}`);
  }
}
