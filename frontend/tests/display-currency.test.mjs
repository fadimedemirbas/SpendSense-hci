import assert from "node:assert/strict";
import test from "node:test";
import {
  canSaveDisplayCurrency,
  displayCurrencyNote,
  displayCurrencyOptions,
} from "../src/lib/displayCurrency.ts";
import { nextSegmentIndex } from "../src/lib/segmented.ts";
import {
  CLIENT_PROTOCOL,
  WorkspaceProtocolError,
  normalizeLoadedWorkspace,
  prepareVersionedWorkspaceSave,
} from "../src/lib/workspaceProtocol.ts";
import { emptyWorkspace } from "../src/lib/workspace.ts";
import { emptyProfile } from "../src/store.ts";

test("this build is protocol 3: TRY, USD and EUR can all be chosen", () => {
  assert.equal(CLIENT_PROTOCOL, 3);
  assert.deepEqual(displayCurrencyOptions(), [
    { value: "TRY", label: "₺ TRY", disabled: false },
    { value: "USD", label: "$ USD", disabled: false },
    { value: "EUR", label: "€ EUR", disabled: false },
  ]);
  for (const currency of ["TRY", "USD", "EUR"])
    assert.equal(canSaveDisplayCurrency(currency), true);
  assert.match(displayCurrencyNote(), /original amounts/);
});

test("a TRY-only (protocol 1) client offers USD and EUR but cannot choose them", () => {
  assert.deepEqual(displayCurrencyOptions(1), [
    { value: "TRY", label: "₺ TRY", disabled: false },
    { value: "USD", label: "$ USD", disabled: true },
    { value: "EUR", label: "€ EUR", disabled: true },
  ]);
  assert.equal(canSaveDisplayCurrency("TRY", 1), true);
  assert.equal(canSaveDisplayCurrency("USD", 1), false);
  assert.equal(canSaveDisplayCurrency("EUR", 1), false);
  assert.match(displayCurrencyNote(1), /become available/);
});

test("protocol 3 enables every display currency without other changes", () => {
  assert.deepEqual(
    displayCurrencyOptions(3).map((option) => [option.value, option.disabled]),
    [
      ["TRY", false],
      ["USD", false],
      ["EUR", false],
    ],
  );
  assert.equal(canSaveDisplayCurrency("EUR", 3), true);
  assert.match(displayCurrencyNote(3), /original amounts/);
  for (const protocol of [0, 2, 4]) assert.equal(canSaveDisplayCurrency("USD", protocol), false);
});

test("the selector's rule matches what the save protocol can actually persist", () => {
  const previous = emptyWorkspace("me@example.com");
  for (const currency of ["TRY", "USD", "EUR"]) {
    for (const protocol of [1, 3]) {
      const next = { ...previous, profile: { ...previous.profile, displayCurrency: currency } };
      const save = () => prepareVersionedWorkspaceSave(previous, next, "owner", protocol);
      if (canSaveDisplayCurrency(currency, protocol)) {
        const { payload } = save();
        assert.equal(payload.profile.displayCurrency, currency);
        assert.equal(payload.schemaVersion, protocol);
      } else
        assert.throws(
          save,
          (error) =>
            error instanceof WorkspaceProtocolError && error.code === "SS_PROTOCOL_UNSUPPORTED",
        );
    }
  }
});

test("existing users default to TRY and keep their symbol/code amount format", () => {
  assert.equal(emptyProfile.displayCurrency, "TRY");
  for (const format of ["symbol", "code"]) {
    const loaded = {
      profile: {
        email: "me@example.com",
        income: 3,
        savings: 1,
        habits: [0, 1, 2, 0],
        onboarded: true,
        currency: format,
      },
      entries: [],
      goals: [],
      waiting: [],
      decisions: [],
      analyses: [],
    };
    const { profile } = normalizeLoadedWorkspace(loaded);
    assert.equal(profile.displayCurrency, "TRY");
    assert.equal(profile.currency, format);
    assert.deepEqual(
      { ...profile, displayCurrency: undefined },
      { ...loaded.profile, displayCurrency: undefined },
    );
  }
});

test("segmented keyboard movement is unchanged without disabled options", () => {
  const all = [true, true, true];
  assert.equal(nextSegmentIndex(0, "ArrowRight", all), 1);
  assert.equal(nextSegmentIndex(2, "ArrowRight", all), 0);
  assert.equal(nextSegmentIndex(0, "ArrowLeft", all), 2);
  assert.equal(nextSegmentIndex(1, "ArrowUp", all), 0);
  assert.equal(nextSegmentIndex(1, "ArrowDown", all), 2);
  assert.equal(nextSegmentIndex(2, "Home", all), 0);
  assert.equal(nextSegmentIndex(0, "End", all), 2);
  assert.equal(nextSegmentIndex(-1, "ArrowRight", all), 0);
  assert.equal(nextSegmentIndex(0, "ArrowRight", [true, true]), 1);
});

test("segmented keyboard movement skips disabled options and stays put when none is left", () => {
  const tryOnly = [true, false, false];
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "Home", "End"])
    assert.equal(nextSegmentIndex(0, key, tryOnly), 0, key);
  const middleDisabled = [true, false, true];
  assert.equal(nextSegmentIndex(0, "ArrowRight", middleDisabled), 2);
  assert.equal(nextSegmentIndex(2, "ArrowLeft", middleDisabled), 0);
  assert.equal(nextSegmentIndex(0, "End", [true, true, false]), 1);
  assert.equal(nextSegmentIndex(2, "Home", [false, true, true]), 1);
});
