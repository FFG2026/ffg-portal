export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)
  ).getUTCDate();
  cursor.setUTCDate(Math.min(day, lastDay));
  return cursor.toISOString().slice(0, 10);
}

export function buildPaymentSchedule(opts: {
  termMonths: number;
  monthlyInstalment: number;
  startDate: string;
}) {
  const rows = [];
  const remainingStart = opts.monthlyInstalment * opts.termMonths;
  for (let i = 1; i <= opts.termMonths; i++) {
    const dueDate = addMonths(opts.startDate, i);
    const balanceAfter = Math.round((remainingStart - opts.monthlyInstalment * i) * 100) / 100;
    rows.push({
      instalment_number: i,
      due_date: dueDate,
      amount: opts.monthlyInstalment,
      status: "due",
      paid_date: null,
      balance_after: Math.max(0, balanceAfter),
    });
  }
  return rows;
}
