import { z } from 'zod';

export const QuestSchema = z.object({
  id: z.string().describe('Unique quest ID'),
  title: z.string().describe('Quest title (e.g., "Reach the Viewpoint")'),
  description: z.string().describe('Quest description and narrative'),
  objective: z.string().describe('Objective to complete (e.g., "Walk to coordinates [x, y, z]")'),
  reward: z.object({
    xp: z.number().describe('Experience points'),
    items: z.array(z.string()).describe('Item IDs awarded'),
  }),
  difficulty: z.enum(['easy', 'medium', 'hard']).describe('Quest difficulty'),
  location: z.object({
    x: z.number().describe('World X coordinate'),
    y: z.number().describe('World Y coordinate'),
    z: z.number().describe('World Z coordinate'),
    radius: z.number().describe('Interaction radius in meters'),
  }).describe('Quest location in world space'),
  tags: z.array(z.string()).describe('Quest tags (e.g., ["exploration", "scenic"])'),
});

export type Quest = z.infer<typeof QuestSchema>;
