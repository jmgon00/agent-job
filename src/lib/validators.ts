import { z } from "zod";

export const emailSchema = z.object({
  email: z.string().email("Email invalido"),
});

export type EmailInput = z.infer<typeof emailSchema>;
