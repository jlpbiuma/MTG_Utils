import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ManaCost } from "@/components/mana-cost";

describe("ManaCost Component", () => {
  it("should render nothing when manaCost is null or undefined", () => {
    const { container } = render(<ManaCost manaCost={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("should parse and render mana symbols correctly", () => {
    render(<ManaCost manaCost="{2}{U}{U}" />);

    const symbol2 = screen.getByText("2");
    const symbolU = screen.getAllByText("U");

    expect(symbol2).toBeInTheDocument();
    expect(symbolU).toHaveLength(2);
  });

  it("should render symbols with appropriate title attribute for accessibility", () => {
    render(<ManaCost manaCost="{W}{B}" />);

    expect(screen.getByTitle("Mana: W")).toBeInTheDocument();
    expect(screen.getByTitle("Mana: B")).toBeInTheDocument();
  });
});
