import { z } from 'zod';

export const OrganizationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  logo: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type Organization = z.infer<typeof OrganizationSchema>;
