import { execFileSync } from "child_process";
import { join } from "path";

// LANGUAGE.md is generated from the grammars (and the evaluator's builtin
// tables) by scripts/generate-lang-ref.mjs. This test makes staleness a CI
// failure: touch the grammar without regenerating the reference — or add a
// grammar construct without documenting its semantics in the generator — and
// this fails with the generator's own message.
describe("generated language reference", () => {
  it("LANGUAGE.md is up to date with the grammar", () => {
    const script = join(__dirname, "..", "scripts", "generate-lang-ref.mjs");
    // Throws (failing the test) on a non-zero exit; stderr carries the reason.
    execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" });
  });
});
