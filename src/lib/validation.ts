import { z } from "zod";

export const transactionSchema = z.object({
  title: z.string().trim().min(2, "Title must contain at least 2 characters.").max(60),
  amount: z.coerce.number().finite().positive("Amount must be greater than zero.").max(999999999999),
  transaction_type: z.enum(["income", "expense"]),
  category_id: z.string().uuid("Choose a valid category."),
  transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  payment_method: z.enum(["cash", "upi", "debit_card", "credit_card", "bank_transfer", "net_banking", "other"]),
  notes: z.string().max(500).optional().or(z.literal(""))
}).superRefine((v, ctx) => {
  if (!Number.isFinite(new Date(v.transaction_date + "T00:00:00").getTime())) {
    ctx.addIssue({ code: "custom", path: ["transaction_date"], message: "Invalid calendar date." });
  }
});
