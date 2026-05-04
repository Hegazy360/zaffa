import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { randomUUID } from "node:crypto";

const {
  requestMutateMock,
  toastErrorMock,
  toastSuccessMock,
  invalidateMock,
  requestMutationState,
} = vi.hoisted(() => ({
  requestMutateMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  invalidateMock: vi.fn(),
  requestMutationState: { isPending: false },
}));

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: toastSuccessMock },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock("@/lib/use-formatters", () => ({
  useFormatters: () => ({
    currency: (n: number, c: string) => `${n} ${c}`,
    date: (d: Date | string) => String(d),
    number: (n: number) => String(n),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      paymentSchedules: {
        forEvent: { invalidate: invalidateMock },
      },
    }),
    paymentSchedules: {
      requestAmendment: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (e: { message: string }) => void;
        }) => ({
          mutate: (vars: unknown) => {
            requestMutateMock(vars);
            // Simulate the success callback firing immediately for the
            // happy-path assertions.
            if (!requestMutationState.isPending && opts.onSuccess) {
              opts.onSuccess();
            }
          },
          isPending: requestMutationState.isPending,
        }),
      },
    },
  },
}));

const { AmendmentDialog } = await import(
  "@/components/payments/AmendmentDialog"
);

const SCHEDULE_ID = randomUUID();
const EVENT_ID = randomUUID();
const PENDING_INSTALLMENT_ID = randomUUID();
const PAID_INSTALLMENT_ID = randomUUID();

function buildSchedule() {
  return {
    id: SCHEDULE_ID,
    currency: "EGP",
    total_amount: 1500,
    platform_fee_pct: 8,
    installments: [
      {
        id: PAID_INSTALLMENT_ID,
        label: "Deposit",
        amount: 500,
        status: "paid",
        due_date: null,
      },
      {
        id: PENDING_INSTALLMENT_ID,
        label: "Final",
        amount: 1000,
        status: "pending",
        due_date: "2030-01-01",
      },
    ],
  };
}

beforeEach(() => {
  requestMutateMock.mockReset();
  toastErrorMock.mockReset();
  toastSuccessMock.mockReset();
  invalidateMock.mockReset();
  requestMutationState.isPending = false;
});

afterEach(() => vi.clearAllMocks());

describe("<AmendmentDialog />", () => {
  it("hydrates rows from open installments only (paid rows are locked)", () => {
    render(
      <AmendmentDialog
        eventId={EVENT_ID}
        schedule={buildSchedule()}
        open={true}
        onOpenChange={() => {}}
      />
    );

    // The form should expose the open installment as an editable row.
    const labelInput = screen.getByDisplayValue("Final") as HTMLInputElement;
    expect(labelInput).toBeInTheDocument();

    // Locked panel surfaces the paid row's label too.
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("lockedAlreadyPaid")).toBeInTheDocument();
  });

  it("toasts an error when no installment rows have a label and amount", () => {
    render(
      <AmendmentDialog
        eventId={EVENT_ID}
        schedule={buildSchedule()}
        open={true}
        onOpenChange={() => {}}
      />
    );

    // Wipe the only row's label so validation rejects on submit.
    const labelInput = screen.getByDisplayValue("Final") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "" } });

    fireEvent.click(screen.getByRole("button", { name: /sendForReview/i }));

    expect(toastErrorMock).toHaveBeenCalledWith("minOneInstallment");
    expect(requestMutateMock).not.toHaveBeenCalled();
  });

  it("submits cleaned installments to requestAmendment on valid input", () => {
    const onOpenChange = vi.fn();
    render(
      <AmendmentDialog
        eventId={EVENT_ID}
        schedule={buildSchedule()}
        open={true}
        onOpenChange={onOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /sendForReview/i }));

    expect(requestMutateMock).toHaveBeenCalledWith({
      scheduleId: SCHEDULE_ID,
      installments: [
        expect.objectContaining({ label: "Final", amount: 1000 }),
      ],
      reason: undefined,
    });
    // Success path closes the dialog + invalidates the schedule query.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(invalidateMock).toHaveBeenCalledWith({ eventId: EVENT_ID });
    expect(toastSuccessMock).toHaveBeenCalledWith("amendmentSentToast");
  });

  it("disables submit and cancel while the mutation is in flight", () => {
    requestMutationState.isPending = true;
    render(
      <AmendmentDialog
        eventId={EVENT_ID}
        schedule={buildSchedule()}
        open={true}
        onOpenChange={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: /sendForReview/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });
});
