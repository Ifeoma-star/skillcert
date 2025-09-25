
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

describe("SkillCert Contract Tests - Issuer Management & Credential Minting", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
    simnet.callPublicFn(
      "skillcert",
      "add-skill-category",
      [Cl.stringUtf8("programming"), Cl.stringUtf8("Software development skills")],
      deployer
    );
  });

  describe("Issuer Registration", () => {
    it("should allow issuer registration with valid parameters", () => {
      const registerIssuer = simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Tech University"), Cl.uint(1)],
        wallet1
      );
      expect(registerIssuer.result).toBeOk(Cl.bool(true));

      const issuer = simnet.callReadOnlyFn("skillcert", "get-issuer-info", [Cl.principal(wallet1)], deployer);
      expect(issuer.result).toBeSome(Cl.tuple({
        name: Cl.stringUtf8("Tech University"),
        "issuer-type": Cl.uint(1),
        verified: Cl.bool(false),
        "credentials-issued": Cl.uint(0),
        "reputation-score": Cl.uint(0)
      }));
    });

    it("should reject invalid issuer type", () => {
      const registerIssuer = simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Invalid Issuer"), Cl.uint(5)],
        wallet1
      );
      expect(registerIssuer.result).toBeErr(Cl.uint(103));
    });

    it("should reject duplicate issuer registration", () => {
      simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Tech University"), Cl.uint(1)],
        wallet1
      );

      const registerDuplicate = simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Another University"), Cl.uint(2)],
        wallet1
      );
      expect(registerDuplicate.result).toBeErr(Cl.uint(103));
    });

    it("should reject registration when contract is paused", () => {
      simnet.callPublicFn("skillcert", "toggle-contract-pause", [], deployer);

      const registerIssuer = simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Paused University"), Cl.uint(1)],
        wallet1
      );
      expect(registerIssuer.result).toBeErr(Cl.uint(103));
    });
  });

  describe("Issuer Verification", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Tech University"), Cl.uint(1)],
        wallet1
      );
    });

    it("should allow owner to verify issuer", () => {
      const verifyIssuer = simnet.callPublicFn(
        "skillcert",
        "verify-issuer",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(verifyIssuer.result).toBeOk(Cl.bool(true));

      const issuer = simnet.callReadOnlyFn("skillcert", "get-issuer-info", [Cl.principal(wallet1)], deployer);
      expect(issuer.result).toBeSome(Cl.tuple({
        name: Cl.stringUtf8("Tech University"),
        "issuer-type": Cl.uint(1),
        verified: Cl.bool(true),
        "credentials-issued": Cl.uint(0),
        "reputation-score": Cl.uint(0)
      }));
    });

    it("should reject verification from non-owner", () => {
      const verifyIssuer = simnet.callPublicFn(
        "skillcert",
        "verify-issuer",
        [Cl.principal(wallet1)],
        wallet2
      );
      expect(verifyIssuer.result).toBeErr(Cl.uint(100));
    });

    it("should reject verification of non-existent issuer", () => {
      const verifyIssuer = simnet.callPublicFn(
        "skillcert",
        "verify-issuer",
        [Cl.principal(wallet3)],
        deployer
      );
      expect(verifyIssuer.result).toBeErr(Cl.uint(101));
    });

    it("should reject double verification", () => {
      simnet.callPublicFn("skillcert", "verify-issuer", [Cl.principal(wallet1)], deployer);

      const verifyAgain = simnet.callPublicFn(
        "skillcert",
        "verify-issuer",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(verifyAgain.result).toBeErr(Cl.uint(104));
    });
  });

  describe("Credential Minting", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Tech University"), Cl.uint(1)],
        wallet1
      );
      simnet.callPublicFn("skillcert", "verify-issuer", [Cl.principal(wallet1)], deployer);
    });

    it("should mint credential successfully", () => {
      const mintCredential = simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("JavaScript Development"),
          Cl.stringUtf8("programming"),
          Cl.uint(2),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet1
      );
      expect(mintCredential.result).toBeOk(Cl.uint(1));

      const credential = simnet.callReadOnlyFn("skillcert", "get-credential-details", [Cl.uint(1)], deployer);
      expect(credential.result).toBeSome(Cl.tuple({
        holder: Cl.principal(wallet2),
        issuer: Cl.principal(wallet1),
        "skill-name": Cl.stringUtf8("JavaScript Development"),
        "skill-category": Cl.stringUtf8("programming"),
        "certification-level": Cl.uint(2),
        "issue-date": Cl.uint(simnet.blockHeight),
        "expiry-date": Cl.uint(simnet.blockHeight + 8640),
        verified: Cl.bool(true),
        "metadata-uri": Cl.stringUtf8("https://example.com/metadata"),
        revoked: Cl.bool(false)
      }));

      const holderProfile = simnet.callReadOnlyFn("skillcert", "get-holder-profile", [Cl.principal(wallet2)], deployer);
      expect(holderProfile.result).toBeSome(Cl.tuple({
        "total-credentials": Cl.uint(1),
        "verified-credentials": Cl.uint(1),
        "skill-points": Cl.uint(25),
        "profile-active": Cl.bool(true)
      }));
    });

    it("should reject minting from unverified issuer", () => {
      simnet.callPublicFn(
        "skillcert",
        "register-issuer",
        [Cl.stringUtf8("Unverified University"), Cl.uint(1)],
        wallet3
      );

      const mintCredential = simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("Python Development"),
          Cl.stringUtf8("programming"),
          Cl.uint(1),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet3
      );
      expect(mintCredential.result).toBeErr(Cl.uint(105));
    });

    it("should reject minting with invalid certification level", () => {
      const mintCredential = simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("Invalid Level"),
          Cl.stringUtf8("programming"),
          Cl.uint(5),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet1
      );
      expect(mintCredential.result).toBeErr(Cl.uint(103));
    });

    it("should reject minting with invalid category", () => {
      const mintCredential = simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("Unknown Skill"),
          Cl.stringUtf8("unknown-category"),
          Cl.uint(1),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet1
      );
      expect(mintCredential.result).toBeErr(Cl.uint(103));
    });

    it("should update issuer statistics after minting", () => {
      simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("React Development"),
          Cl.stringUtf8("programming"),
          Cl.uint(3),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet1
      );

      const issuer = simnet.callReadOnlyFn("skillcert", "get-issuer-info", [Cl.principal(wallet1)], deployer);
      expect(issuer.result).toBeSome(Cl.tuple({
        name: Cl.stringUtf8("Tech University"),
        "issuer-type": Cl.uint(1),
        verified: Cl.bool(true),
        "credentials-issued": Cl.uint(1),
        "reputation-score": Cl.uint(1)
      }));
    });

    it("should update skill category statistics after minting", () => {
      simnet.callPublicFn(
        "skillcert",
        "mint-credential",
        [
          Cl.principal(wallet2),
          Cl.stringUtf8("Node.js Development"),
          Cl.stringUtf8("programming"),
          Cl.uint(2),
          Cl.uint(8640),
          Cl.stringUtf8("https://example.com/metadata")
        ],
        wallet1
      );

      const category = simnet.callReadOnlyFn(
        "skillcert",
        "get-skill-category",
        [Cl.stringUtf8("programming")],
        deployer
      );
      expect(category.result).toBeSome(Cl.tuple({
        active: Cl.bool(true),
        "total-credentials": Cl.uint(1),
        "category-description": Cl.stringUtf8("Software development skills")
      }));
    });

    it("should calculate correct skill points for different levels", () => {
      const levels = [
        { level: 1, points: 10 },
        { level: 2, points: 25 },
        { level: 3, points: 50 },
        { level: 4, points: 100 }
      ];

      levels.forEach(({ level, points }, index) => {
        const holder = index === 0 ? wallet2 : wallet3;
        simnet.callPublicFn(
          "skillcert",
          "mint-credential",
          [
            Cl.principal(holder),
            Cl.stringUtf8(`Skill Level ${level}`),
            Cl.stringUtf8("programming"),
            Cl.uint(level),
            Cl.uint(8640),
            Cl.stringUtf8("https://example.com/metadata")
          ],
          wallet1
        );

        const profile = simnet.callReadOnlyFn("skillcert", "get-holder-profile", [Cl.principal(holder)], deployer);
        expect(profile.result).toBeSome(Cl.tuple({
          "total-credentials": Cl.uint(1),
          "verified-credentials": Cl.uint(1),
          "skill-points": Cl.uint(points),
          "profile-active": Cl.bool(true)
        }));
      });
    });
  });
});

describe("SkillCert Contract Tests - Credential Lifecycle & Marketplace", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
    simnet.callPublicFn(
      "skillcert",
      "add-skill-category",
      [Cl.stringUtf8("programming"), Cl.stringUtf8("Software development skills")],
      deployer
    );
    simnet.callPublicFn(
      "skillcert",
      "register-issuer",
      [Cl.stringUtf8("Tech University"), Cl.uint(1)],
      wallet1
    );
    simnet.callPublicFn("skillcert", "verify-issuer", [Cl.principal(wallet1)], deployer);
    simnet.callPublicFn(
      "skillcert",
      "mint-credential",
      [
        Cl.principal(wallet2),
        Cl.stringUtf8("JavaScript Development"),
        Cl.stringUtf8("programming"),
        Cl.uint(2),
        Cl.uint(8640),
        Cl.stringUtf8("https://example.com/metadata")
      ],
      wallet1
    );
  });

  describe("Credential Validation", () => {
    it("should validate active credential correctly", () => {
      const isValid = simnet.callReadOnlyFn("skillcert", "is-credential-valid", [Cl.uint(1)], deployer);
      expect(isValid.result).toBeOk(Cl.bool(true));
    });

    it("should invalidate revoked credential", () => {
      simnet.callPublicFn("skillcert", "revoke-credential", [Cl.uint(1)], wallet1);
      
      const isValid = simnet.callReadOnlyFn("skillcert", "is-credential-valid", [Cl.uint(1)], deployer);
      expect(isValid.result).toBeOk(Cl.bool(false));
    });
  });

  describe("Credential Management", () => {
    it("should allow issuer to revoke credential", () => {
      const revokeCredential = simnet.callPublicFn("skillcert", "revoke-credential", [Cl.uint(1)], wallet1);
      expect(revokeCredential.result).toBeOk(Cl.bool(true));

      const credential = simnet.callReadOnlyFn("skillcert", "get-credential-details", [Cl.uint(1)], deployer);
      expect(credential.result).toBeSome(
        Cl.tuple({
          holder: Cl.principal(wallet2),
          issuer: Cl.principal(wallet1),
          "skill-name": Cl.stringUtf8("JavaScript Development"),
          "skill-category": Cl.stringUtf8("programming"),
          "certification-level": Cl.uint(2),
          "issue-date": Cl.uint(simnet.blockHeight - 1),
          "expiry-date": Cl.uint(simnet.blockHeight - 1 + 8640),
          verified: Cl.bool(true),
          "metadata-uri": Cl.stringUtf8("https://example.com/metadata"),
          revoked: Cl.bool(true)
        })
      );
    });

    it("should reject revocation from non-issuer", () => {
      const revokeCredential = simnet.callPublicFn("skillcert", "revoke-credential", [Cl.uint(1)], wallet2);
      expect(revokeCredential.result).toBeErr(Cl.uint(101));
    });

    it("should allow issuer to renew credential", () => {
      const renewCredential = simnet.callPublicFn(
        "skillcert",
        "renew-credential",
        [Cl.uint(1), Cl.uint(17280)],
        wallet1
      );
      expect(renewCredential.result).toBeOk(Cl.bool(true));
    });

    it("should allow holder to transfer credential", () => {
      const transferCredential = simnet.callPublicFn(
        "skillcert",
        "transfer-credential",
        [Cl.uint(1), Cl.principal(wallet3)],
        wallet2
      );
      expect(transferCredential.result).toBeOk(Cl.bool(true));

      const credential = simnet.callReadOnlyFn("skillcert", "get-credential-details", [Cl.uint(1)], deployer);
      expect(credential.result).toBeSome(
        Cl.tuple({
          holder: Cl.principal(wallet3),
          issuer: Cl.principal(wallet1),
          "skill-name": Cl.stringUtf8("JavaScript Development"),
          "skill-category": Cl.stringUtf8("programming"),
          "certification-level": Cl.uint(2),
          "issue-date": Cl.uint(simnet.blockHeight - 1),
          "expiry-date": Cl.uint(simnet.blockHeight - 1 + 8640),
          verified: Cl.bool(true),
          "metadata-uri": Cl.stringUtf8("https://example.com/metadata"),
          revoked: Cl.bool(false)
        })
      );
    });

    it("should reject transfer from non-holder", () => {
      const transferCredential = simnet.callPublicFn(
        "skillcert",
        "transfer-credential",
        [Cl.uint(1), Cl.principal(wallet3)],
        wallet1
      );
      expect(transferCredential.result).toBeErr(Cl.uint(101));
    });
  });

  describe("Marketplace Functions", () => {
    it("should allow listing credential for verification", () => {
      const listCredential = simnet.callPublicFn(
        "skillcert",
        "list-credential-for-verification",
        [Cl.uint(1), Cl.uint(100000)],
        wallet2
      );
      expect(listCredential.result).toBeOk(Cl.bool(true));

      const listing = simnet.callReadOnlyFn(
        "skillcert",
        "get-credential-listing",
        [Cl.uint(1), Cl.principal(wallet2)],
        deployer
      );
      expect(listing.result).toBeSome(Cl.tuple({
        "verification-price": Cl.uint(100000),
        available: Cl.bool(true),
        "listed-at": Cl.uint(simnet.blockHeight)
      }));
    });

    it("should handle verification requests", () => {
      const requestVerification = simnet.callPublicFn(
        "skillcert",
        "request-credential-verification",
        [Cl.principal(wallet2), Cl.uint(1), Cl.uint(200000)],
        wallet3
      );
      expect(requestVerification.result).toBeOk(Cl.uint(1));

      const completeVerification = simnet.callPublicFn(
        "skillcert",
        "complete-verification-request",
        [Cl.uint(1), Cl.bool(true)],
        wallet2
      );
      expect(completeVerification.result).toBeOk(Cl.bool(true));
    });

    it("should allow purchasing verification access", () => {
      simnet.callPublicFn(
        "skillcert",
        "list-credential-for-verification",
        [Cl.uint(1), Cl.uint(100000)],
        wallet2
      );

      const purchaseAccess = simnet.callPublicFn(
        "skillcert",
        "purchase-verification-access",
        [Cl.uint(1), Cl.principal(wallet2)],
        wallet3
      );
      expect(purchaseAccess.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Analytics & Emergency Functions", () => {
    it("should get holder skill summary", () => {
      const skillSummary = simnet.callReadOnlyFn("skillcert", "get-holder-skill-summary", [Cl.principal(wallet2)], deployer);
      expect(skillSummary.result).toBeOk(Cl.tuple({
        "total-credentials": Cl.uint(1),
        "verified-credentials": Cl.uint(1),
        "skill-points": Cl.uint(25),
        "verification-rate": Cl.uint(100)
      }));
    });

    it("should calculate credential trust score", () => {
      const trustScore = simnet.callReadOnlyFn("skillcert", "calculate-credential-trust-score", [Cl.uint(1)], deployer);
      expect(trustScore.result).toBeOk(Cl.uint(410));
    });

    it("should allow owner to emergency revoke credential", () => {
      const emergencyRevoke = simnet.callPublicFn("skillcert", "emergency-revoke-credential", [Cl.uint(1)], deployer);
      expect(emergencyRevoke.result).toBeOk(Cl.bool(true));
    });

    it("should allow owner to withdraw platform fees", () => {
      const withdrawFees = simnet.callPublicFn("skillcert", "withdraw-platform-fees", [], deployer);
      expect(withdrawFees.result).toBeOk(Cl.uint(500000));
    });
  });
});
