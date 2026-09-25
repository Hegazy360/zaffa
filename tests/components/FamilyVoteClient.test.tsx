import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";

// F6, the family vote page: what it sends when a vote is retried. The
// tRPC hooks are faked so each attempt's input can be read back.

type VoteInput = { token: string; mediaId: string; voterKey: string; voterName: string };

const state = vi.hoisted(() => ({
  calls: [] as VoteInput[],
  /** One entry per attempt: true fails it the way a lost response does. */
  failures: [] as boolean[],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/media-image", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- a stand-in for next/image in jsdom
  MediaImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    designShares: {
      getByToken: { useQuery: () => ({ data: undefined, isError: false }) },
      vote: {
        useMutation: () => ({
          isPending: false,
          variables: undefined,
          mutateAsync: async (input: VoteInput) => {
            state.calls.push(input);
            if (state.failures.shift()) throw new Error("Failed to fetch");
            return { ok: true, mediaId: input.mediaId };
          },
        }),
      },
    },
  },
}));

const { FamilyVoteClient } = await import("@/app/s/[token]/family-vote-client");

const m = en.familyShare;
const TOKEN = "Zk3v9Q_hT2m-8xYcLp0aBw";
const V1 = "7a7a7a7a-1111-4222-8333-944455556666";
const V2 = "8b8b8b8b-1111-4222-8333-944455556666";
const VOTER_STORAGE = "zaffa:family-voter";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function open() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FamilyVoteClient
        token={TOKEN}
        enabled
        initial={{
          coupleName: "Noor",
          designName: null,
          versions: [
            { id: V1, number: 1, url: "https://res.cloudinary.com/demo/wm/r1.jpg", caption: null },
            { id: V2, number: 2, url: "https://res.cloudinary.com/demo/wm/r2.jpg", caption: null },
          ],
        }}
      />
    </NextIntlClientProvider>,
  );
}

function storedVoter(): { key?: string; name?: string } | null {
  const raw = window.localStorage.getItem(VOTER_STORAGE);
  return raw ? JSON.parse(raw) : null;
}

/** Heart on version 2, first name, send: the first vote from this phone. */
async function voteForSecond(name: string) {
  await act(async () => {
    fireEvent.click(screen.getAllByRole("button", { name: m.voteCta })[1]);
  });
  fireEvent.change(screen.getByLabelText(m.nameLabel), { target: { value: name } });
  await send();
}

async function send() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: m.submitVote }));
  });
}

beforeEach(() => {
  state.calls = [];
  state.failures = [];
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("family vote page, a retried first vote", () => {
  it("keeps the voter key from the attempt the server may have kept, so one person is one vote", async () => {
    open();
    // The server kept it, but the answer never reached the phone.
    state.failures = [true];
    await voteForSecond("Mona");

    expect(screen.getByRole("alert")).toHaveTextContent(m.voteError);
    const firstKey = state.calls[0].voterKey;
    expect(firstKey).toMatch(UUID);
    // Saved before the request went out, and no name yet: the dialog asks
    // again if they come back later.
    expect(storedVoter()).toEqual({ key: firstKey, name: "" });

    await send();

    expect(state.calls).toHaveLength(2);
    expect(state.calls[1]).toMatchObject({ mediaId: V2, voterKey: firstKey, voterName: "Mona" });
    expect(storedVoter()).toEqual({ key: firstKey, name: "Mona" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reuses the key on a later visit when the first vote never went through", async () => {
    const earlier = "0f0e0d0c-1111-4222-8333-944455556666";
    window.localStorage.setItem(VOTER_STORAGE, JSON.stringify({ key: earlier, name: "" }));
    open();

    await voteForSecond("Mona");

    expect(state.calls).toEqual([
      expect.objectContaining({ voterKey: earlier, voterName: "Mona" }),
    ]);
  });

  it("reuses the key within the page even where storage refuses writes", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    open();
    state.failures = [true];
    await voteForSecond("Mona");
    await send();

    expect(state.calls).toHaveLength(2);
    expect(state.calls[0].voterKey).toMatch(UUID);
    expect(state.calls[1].voterKey).toBe(state.calls[0].voterKey);
  });

  it("changing their mind after a vote keeps the same key", async () => {
    open();
    await voteForSecond("Mona");
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: m.voteCta })[0]);
    });

    expect(state.calls).toHaveLength(2);
    expect(state.calls[1]).toMatchObject({ mediaId: V1, voterName: "Mona" });
    expect(state.calls[1].voterKey).toBe(state.calls[0].voterKey);
  });
});
