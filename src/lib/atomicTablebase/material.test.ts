import { isAtomicTablebasePosition } from "./material";

describe("atomic tablebase material", () => {
  it("recognizes positions with at most five pieces", () => {
    expect(isAtomicTablebasePosition("8/8/8/8/3k4/8/1K3P1P/6N1 w - - 3 71")).toBe(true);
    expect(isAtomicTablebasePosition("8/8/8/8/3k4/8/1K3P1P/6NR w - - 3 71")).toBe(false);
  });
});
