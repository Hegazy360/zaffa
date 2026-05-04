import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { randomUUID } from "node:crypto";

const {
  forEventQueryMock,
  createCheckoutMutateMock,
  decideAmendmentMutateMock,
  withdrawAmendmentMutateMock,
  toastErrorMock,
  invalidateMock,
  checkoutMutationState,
} = vi.hoisted(() => {
  const checkoutMutationState = {
    isPending: false,
    variables: undefined as { installmentId: string } | undefined,
  };
  return {
    forEventQueryMock: vi.fn(),
    createCheckoutMutateMock: vi.fn(),
    decideAmendmentMutateMock: vi.fn(),
    withdrawAmendmentMutateMock: vi.fn(),
    toastErrorMock: vi.fn(),
    invalidateMock: vi.fn(),
    checkoutMutationState,
  };
});

vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}(${JSON.stringify(vars)})` : k,
}));

vi.mock("@/lib/use-formatters", () => ({
  useFormatters: () => ({
    currency: (n: number, c: string) => `${n} ${c}`,
    date: (d: Date | string) => String(d),
    number: (n: number) => String(n),
  }),
}));

// Stub the AmendmentDialog so this test stays focused on the panel itself.
vi.mock("@/components/payments/AmendmentDialog", () => ({
  AmendmentDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="amendment-dialog-stub" /> : null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      paymentSchedules: {
        forEvent: { invalidate: invalidateMock },
      },
      payouts: {
        plannerBalance: { invalidate: invalidateMock },
        pendingInstallments: { invalidate: invalidateMock },
      },
    }),
    paymentSchedules: {
      forEvent: {
        useQuery: (...args: unknown[]) => forEventQueryMock(...args),
      },
      decideAmendment: {
        useMutation: () => ({
          mutate: decideAmendmentMutateMock,
          isPending: false,
        }),
      },
      withdrawAmendment: {
        useMutation: () => ({
          mutate: withdrawAmendmentMutateMock,
          isPending: false,
        }),
      },
    },
    payments: {
      createCheckoutSession: {
        useMutation: () => ({
          mutate: createCheckoutMutateMock,
          isPending: checkoutMutationState.isPending,
          variables: checkoutMutationState.variables,
        }),
      },
    },
  },
}));

const { SchedulePanel } = await import("@/components/payments/SchedulePanel");

const EVENT_ID = randomUUID();
const SCHEDULE_ID = randomUUID();
const INSTALLMENT_ID = randomUUID();

function buildSchedule(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SCHEDULE_ID,
    status: "active",
    currency: "EGP",
    total_amount: 1000,
    platform_fee_pct: 8,
    installments: [
      {
        id: INSTALLMENT_ID,
        label: "Deposit",
        amount: 1000,
        currency: "EGP",
        status: "pending",
        due_date: null,
        paid_at: null,
        payout_id: null,
        net_to_planner_amount: null,
        schedule_id: SCHEDULE_ID,
      },
    ],
    amendments: [],
    ...overrides,
  };
}

beforeEach(() => {
  forEventQueryMock.mockReset();
  createCheckoutMutateMock.mockReset();
  decideAmendmentMutateMock.mockReset();
  withdrawAmendmentMutateMock.mockReset();
  toastErrorMock.mockReset();
  invalidateMock.mockReset();
  checkoutMutationState.isPending = false;
  checkoutMutationState.variables = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("<SchedulePanel />", () => {
  it("renders a loading spinner while the schedule query is pending", () => {
    forEventQueryMock.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(
      <SchedulePanel eventId={EVENT_ID} side="client" />
    );
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows the empty-state when no schedule exists", () => {
    forEventQueryMock.mockReturnValue({ data: null, isLoading: false });
    render(<SchedulePanel eventId={EVENT_ID} side="client" />);
    expect(screen.getByText("noPlanTitle")).toBeInTheDocument();
  });

  it("shows the Pay button for pending client installments and triggers checkout", () => {
    forEventQueryMock.mockReturnValue({
      data: buildSchedule(),
      isLoading: false,
    });

    render(<SchedulePanel eventId={EVENT_ID} side="client" />);

    const payButton = screen.getByRole("button", { name: /payNow/i });
    expect(payButton).toBeEnabled();
    fireEvent.click(payButton);
    expect(createCheckoutMutateMock).toHaveBeenCalledWith({
      installmentId: INSTALLMENT_ID,
    });
  });

  it("disables the Pay button while the mutation is pending", () => {
    forEventQueryMock.mockReturnValue({
      data: buildSchedule(),
      isLoading: false,
    });
    checkoutMutationState.isPending = true;
    checkoutMutationState.variables = { installmentId: INSTALLMENT_ID };

    render(<SchedulePanel eventId={EVENT_ID} side="client" />);

    const payButton = screen.getByRole("button", { name: /payNow/i });
    expect(payButton).toBeDisabled();
  });

  it("does not show the Pay button to the planner side", () => {
    forEventQueryMock.mockReturnValue({
      data: buildSchedule(),
      isLoading: false,
    });

    render(<SchedulePanel eventId={EVENT_ID} side="planner" />);
    expect(
      screen.queryByRole("button", { name: /payNow/i })
    ).not.toBeInTheDocument();
  });

  it("hides Pay for paid installments", () => {
    forEventQueryMock.mockReturnValue({
      data: buildSchedule({
        installments: [
          {
            id: INSTALLMENT_ID,
            label: "Deposit",
            amount: 1000,
            currency: "EGP",
            status: "paid",
            due_date: null,
            paid_at: new Date(),
            payout_id: null,
            net_to_planner_amount: 920,
            schedule_id: SCHEDULE_ID,
          },
        ],
      }),
      isLoading: false,
    });

    render(<SchedulePanel eventId={EVENT_ID} side="client" />);
    expect(
      screen.queryByRole("button", { name: /payNow/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("statusPaid")).toBeInTheDocument();
  });

  it("renders the pending amendment banner with accept/reject buttons", () => {
    forEventQueryMock.mockReturnValue({
      data: buildSchedule({
        amendments: [
          {
            id: randomUUID(),
            requested_by_user_id: randomUUID(),
            proposed_installments: [
              { label: "New deposit", amount: 600, due_date: null },
            ],
            proposed_total: 600,
            proposed_fee_pct: 8,
            reason: "Client wants smaller deposit",
            status: "pending",
            created_at: new Date(),
          },
        ],
      }),
      isLoading: false,
    });

    render(<SchedulePanel eventId={EVENT_ID} side="planner" />);

    expect(screen.getByText("pendingAmendmentTitle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(decideAmendmentMutateMock).toHaveBeenCalledWith({
      amendmentId: expect.any(String),
      accept: true,
    });
  });
});
