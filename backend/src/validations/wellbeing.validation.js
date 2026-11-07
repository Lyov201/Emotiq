import { z } from 'zod';
export const entryIdSchema = z.strictObject({ id: z.uuid() });
const moodFields = { moodScore: z.number().int().min(1).max(5), note: z.string().trim().max(2000).nullable().optional() };
const journalFields = { title: z.string().trim().min(1).max(200), content: z.string().trim().min(1).max(6000) };
export const createMoodSchema = z.strictObject(moodFields);
export const updateMoodSchema = z.strictObject({ moodScore: moodFields.moodScore.optional(), note: moodFields.note })
  .refine(value => Object.keys(value).length > 0, 'Provide a field to update');
export const createJournalSchema = z.strictObject(journalFields);
export const updateJournalSchema = z.strictObject({ title: journalFields.title.optional(), content: journalFields.content.optional() })
  .refine(value => Object.keys(value).length > 0, 'Provide a field to update');
export const listEntriesSchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
}).refine(value => !value.from || !value.to || new Date(value.from) <= new Date(value.to), 'from must not follow to');
