
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("SkillCert Contract Tests - Basic Setup & Read Functions", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  describe("Contract Initialization", () => {
    it("should initialize with correct default values", () => {
      const totalCredentials = simnet.callReadOnlyFn("skillcert", "get-total-credentials", [], deployer);
      expect(totalCredentials.result).toBeUint(0);
    });

    it("should verify contract owner", () => {
      const isPaused = simnet.getDataVar("skillcert", "contract-paused");
      expect(isPaused).toBeBool(false);
    });

    it("should have correct platform fee", () => {
      const platformFee = simnet.getDataVar("skillcert", "platform-fee");
      expect(platformFee).toBeUint(500000);
    });
  });

  describe("Read-only Functions", () => {
    it("should return none for non-existent credential", () => {
      const credential = simnet.callReadOnlyFn("skillcert", "get-credential-details", [Cl.uint(999)], deployer);
      expect(credential.result).toBeNone();
    });

    it("should return none for non-existent issuer", () => {
      const issuer = simnet.callReadOnlyFn("skillcert", "get-issuer-info", [Cl.principal(wallet1)], deployer);
      expect(issuer.result).toBeNone();
    });

    it("should return none for non-existent holder profile", () => {
      const profile = simnet.callReadOnlyFn("skillcert", "get-holder-profile", [Cl.principal(wallet1)], deployer);
      expect(profile.result).toBeNone();
    });

    it("should return none for non-existent skill category", () => {
      const category = simnet.callReadOnlyFn("skillcert", "get-skill-category", [Cl.stringUtf8("programming")], deployer);
      expect(category.result).toBeNone();
    });

    it("should return error for invalid credential validation", () => {
      const isValid = simnet.callReadOnlyFn("skillcert", "is-credential-valid", [Cl.uint(999)], deployer);
      expect(isValid.result).toBeErr(Cl.uint(0));
    });
  });

  describe("Administrative Setup Functions", () => {
    it("should allow owner to set platform fee", () => {
      const newFee = 1000000;
      const setPlatformFee = simnet.callPublicFn(
        "skillcert",
        "set-platform-fee",
        [Cl.uint(newFee)],
        deployer
      );
      expect(setPlatformFee.result).toBeOk(Cl.bool(true));
      
      const updatedFee = simnet.getDataVar("skillcert", "platform-fee");
      expect(updatedFee).toBeUint(newFee);
    });

    it("should reject platform fee from non-owner", () => {
      const setPlatformFee = simnet.callPublicFn(
        "skillcert",
        "set-platform-fee",
        [Cl.uint(1000000)],
        wallet1
      );
      expect(setPlatformFee.result).toBeErr(Cl.uint(100));
    });

    it("should reject platform fee above maximum", () => {
      const setPlatformFee = simnet.callPublicFn(
        "skillcert",
        "set-platform-fee",
        [Cl.uint(6000000)],
        deployer
      );
      expect(setPlatformFee.result).toBeErr(Cl.uint(103));
    });

    it("should allow owner to toggle contract pause", () => {
      const togglePause = simnet.callPublicFn("skillcert", "toggle-contract-pause", [], deployer);
      expect(togglePause.result).toBeOk(Cl.bool(true));
      
      const isPaused = simnet.getDataVar("skillcert", "contract-paused");
      expect(isPaused).toBeBool(true);
    });

    it("should reject pause toggle from non-owner", () => {
      const togglePause = simnet.callPublicFn("skillcert", "toggle-contract-pause", [], wallet1);
      expect(togglePause.result).toBeErr(Cl.uint(100));
    });

    it("should allow owner to add skill category", () => {
      const addCategory = simnet.callPublicFn(
        "skillcert",
        "add-skill-category",
        [Cl.stringUtf8("programming"), Cl.stringUtf8("Software development skills")],
        deployer
      );
      expect(addCategory.result).toBeOk(Cl.bool(true));

      const category = simnet.callReadOnlyFn(
        "skillcert",
        "get-skill-category",
        [Cl.stringUtf8("programming")],
        deployer
      );
      expect(category.result).toBeSome(Cl.tuple({
        active: Cl.bool(true),
        "total-credentials": Cl.uint(0),
        "category-description": Cl.stringUtf8("Software development skills")
      }));
    });

    it("should reject duplicate skill category", () => {
      simnet.callPublicFn(
        "skillcert",
        "add-skill-category",
        [Cl.stringUtf8("programming"), Cl.stringUtf8("Software development skills")],
        deployer
      );
      
      const addDuplicate = simnet.callPublicFn(
        "skillcert",
        "add-skill-category",
        [Cl.stringUtf8("programming"), Cl.stringUtf8("Duplicate category")],
        deployer
      );
      expect(addDuplicate.result).toBeErr(Cl.uint(103));
    });

    it("should reject skill category from non-owner", () => {
      const addCategory = simnet.callPublicFn(
        "skillcert",
        "add-skill-category",
        [Cl.stringUtf8("design"), Cl.stringUtf8("Design skills")],
        wallet1
      );
      expect(addCategory.result).toBeErr(Cl.uint(100));
    });
  });
});
