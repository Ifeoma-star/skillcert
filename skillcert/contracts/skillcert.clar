;; SkillCert - Professional Certification Platform

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-authorized (err u101))
(define-constant err-credential-not-found (err u102))
(define-constant err-invalid-parameter (err u103))
(define-constant err-already-verified (err u104))
(define-constant err-not-verified (err u105))
(define-constant err-expired-credential (err u106))
(define-constant err-insufficient-funds (err u107))

;; Data variables
(define-data-var total-credentials uint u0)
(define-data-var platform-fee uint u500000) ;; 0.5 STX in microSTX
(define-data-var total-platform-fees uint u0)
(define-data-var contract-paused bool false)

;; Credential NFT data structure
(define-map credentials
    uint
    {
        holder: principal,
        issuer: principal,
        skill-name: (string-utf8 64),
        skill-category: (string-utf8 32),
        certification-level: uint, ;; 1=Basic, 2=Intermediate, 3=Advanced, 4=Expert
        issue-date: uint,
        expiry-date: uint,
        verified: bool,
        metadata-uri: (string-utf8 256),
        revoked: bool,
    }
)

;; Issuer authorization and reputation
(define-map authorized-issuers
    principal
    {
        name: (string-utf8 128),
        issuer-type: uint, ;; 1=Educational, 2=Corporate, 3=Professional Body
        verified: bool,
        credentials-issued: uint,
        reputation-score: uint,
    }
)

;; Skill category definitions
(define-map skill-categories
    (string-utf8 32)
    {
        active: bool,
        total-credentials: uint,
        category-description: (string-utf8 128),
    }
)

;; Holder profiles
(define-map holder-profiles
    principal
    {
        total-credentials: uint,
        verified-credentials: uint,
        skill-points: uint,
        profile-active: bool,
    }
)

;; Read-only functions
(define-read-only (get-credential-details (credential-id uint))
    (map-get? credentials credential-id)
)

(define-read-only (get-issuer-info (issuer principal))
    (map-get? authorized-issuers issuer)
)

(define-read-only (get-holder-profile (holder principal))
    (map-get? holder-profiles holder)
)

(define-read-only (get-skill-category (category (string-utf8 32)))
    (map-get? skill-categories category)
)

(define-read-only (get-total-credentials)
    (var-get total-credentials)
)

(define-read-only (is-credential-valid (credential-id uint))
    (let ((credential (unwrap! (map-get? credentials credential-id) (err u0))))
        (ok (and
            (get verified credential)
            (not (get revoked credential))
            (> (get expiry-date credential) stacks-block-height)
        ))
    )
)

;; Private functions
(define-private (calculate-skill-points (level uint))
    (if (is-eq level u1)
        u10 ;; Basic: 10 points
        (if (is-eq level u2)
            u25 ;; Intermediate: 25 points
            (if (is-eq level u3)
                u50 ;; Advanced: 50 points
                (if (is-eq level u4)
                    u100 ;; Expert: 100 points
                    u0
                )
            )
        )
    )
)

;; Issuer management
(define-public (register-issuer
        (name (string-utf8 128))
        (issuer-type uint)
    )
    (begin
        (asserts! (not (var-get contract-paused)) err-invalid-parameter)
        (asserts! (and (>= issuer-type u1) (<= issuer-type u3))
            err-invalid-parameter
        )
        (asserts! (is-none (map-get? authorized-issuers tx-sender))
            err-invalid-parameter
        )
        (map-set authorized-issuers tx-sender {
            name: name,
            issuer-type: issuer-type,
            verified: false,
            credentials-issued: u0,
            reputation-score: u0,
        })
        (ok true)
    )
)

(define-public (verify-issuer (issuer principal))
    (let ((issuer-info (unwrap! (map-get? authorized-issuers issuer) err-not-authorized)))
        (begin
            (asserts! (is-eq tx-sender contract-owner) err-owner-only)
            (asserts! (not (get verified issuer-info)) err-already-verified)
            (map-set authorized-issuers issuer
                (merge issuer-info { verified: true })
            )
            (ok true)
        )
    )
)

(define-public (add-skill-category
        (category (string-utf8 32))
        (description (string-utf8 128))
    )
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (is-none (map-get? skill-categories category))
            err-invalid-parameter
        )
        (map-set skill-categories category {
            active: true,
            total-credentials: u0,
            category-description: description,
        })
        (ok true)
    )
)

;; Administrative functions
(define-public (set-platform-fee (new-fee uint))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (asserts! (<= new-fee u5000000) err-invalid-parameter) ;; Max 5 STX
        (var-set platform-fee new-fee)
        (ok true)
    )
)

(define-public (toggle-contract-pause)
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (var-set contract-paused (not (var-get contract-paused)))
        (ok true)
    )
)

(define-public (withdraw-platform-fees)
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (let ((fees (var-get total-platform-fees)))
            (var-set total-platform-fees u0)
            (stx-transfer? fees tx-sender contract-owner)
        )
    )
)

;; Credential minting functionality
(define-public (mint-credential
        (holder principal)
        (skill-name (string-utf8 64))
        (skill-category (string-utf8 32))
        (certification-level uint)
        (validity-duration uint)
        (metadata-uri (string-utf8 256))
    )
    (let (
            (credential-id (+ (var-get total-credentials) u1))
            (issuer-info (unwrap! (map-get? authorized-issuers tx-sender) err-not-authorized))
            (category-info (unwrap! (map-get? skill-categories skill-category)
                err-invalid-parameter
            ))
            (holder-profile (default-to {
                total-credentials: u0,
                verified-credentials: u0,
                skill-points: u0,
                profile-active: false,
            }
                (map-get? holder-profiles holder)
            ))
            (skill-points (calculate-skill-points certification-level))
        )
        (begin
            (asserts! (not (var-get contract-paused)) err-invalid-parameter)
            (asserts! (get verified issuer-info) err-not-verified)
            (asserts! (get active category-info) err-invalid-parameter)
            (asserts!
                (and (>= certification-level u1) (<= certification-level u4))
                err-invalid-parameter
            )
            (asserts! (> validity-duration u0) err-invalid-parameter)
            (asserts! (>= (stx-get-balance holder) (var-get platform-fee))
                err-insufficient-funds
            )
            ;; Collect platform fee from holder
            (unwrap! (stx-transfer? (var-get platform-fee) holder contract-owner)
                err-insufficient-funds
            )
            ;; Create credential NFT
            (map-set credentials credential-id {
                holder: holder,
                issuer: tx-sender,
                skill-name: skill-name,
                skill-category: skill-category,
                certification-level: certification-level,
                issue-date: stacks-block-height,
                expiry-date: (+ stacks-block-height validity-duration),
                verified: true,
                metadata-uri: metadata-uri,
                revoked: false,
            })
            ;; Update holder profile
            (map-set holder-profiles holder {
                total-credentials: (+ (get total-credentials holder-profile) u1),
                verified-credentials: (+ (get verified-credentials holder-profile) u1),
                skill-points: (+ (get skill-points holder-profile) skill-points),
                profile-active: true,
            })
            ;; Update issuer statistics
            (map-set authorized-issuers tx-sender
                (merge issuer-info {
                    credentials-issued: (+ (get credentials-issued issuer-info) u1),
                    reputation-score: (+ (get reputation-score issuer-info) u1),
                })
            )
            ;; Update skill category statistics
            (map-set skill-categories skill-category
                (merge category-info { total-credentials: (+ (get total-credentials category-info) u1) })
            )
            ;; Update platform statistics
            (var-set total-credentials credential-id)
            (var-set total-platform-fees
                (+ (var-get total-platform-fees) (var-get platform-fee))
            )
            (ok credential-id)
        )
    )
)

;; Credential verification and management
(define-public (verify-credential-authenticity (credential-id uint))
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (is-eq tx-sender contract-owner) err-owner-only)
            (asserts! (not (get verified credential)) err-already-verified)
            (map-set credentials credential-id
                (merge credential { verified: true })
            )
            ;; Update holder's verified credentials count
            (let ((holder-profile (unwrap! (map-get? holder-profiles (get holder credential))
                    err-invalid-parameter
                )))
                (map-set holder-profiles (get holder credential)
                    (merge holder-profile { verified-credentials: (+ (get verified-credentials holder-profile) u1) })
                )
            )
            (ok true)
        )
    )
)

(define-public (revoke-credential (credential-id uint))
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (is-eq tx-sender (get issuer credential))
                err-not-authorized
            )
            (asserts! (not (get revoked credential)) err-invalid-parameter)
            (map-set credentials credential-id
                (merge credential { revoked: true })
            )
            ;; Update holder's verified credentials count
            (let ((holder-profile (unwrap! (map-get? holder-profiles (get holder credential))
                    err-invalid-parameter
                )))
                (map-set holder-profiles (get holder credential)
                    (merge holder-profile {
                        verified-credentials: (- (get verified-credentials holder-profile) u1),
                        skill-points: (- (get skill-points holder-profile)
                            (calculate-skill-points (get certification-level credential))
                        ),
                    })
                )
            )
            (ok true)
        )
    )
)

(define-public (renew-credential
        (credential-id uint)
        (new-validity-duration uint)
    )
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (not (var-get contract-paused)) err-invalid-parameter)
            (asserts! (is-eq tx-sender (get issuer credential))
                err-not-authorized
            )
            (asserts! (not (get revoked credential)) err-invalid-parameter)
            (asserts! (> new-validity-duration u0) err-invalid-parameter)
            (asserts!
                (>= (stx-get-balance (get holder credential))
                    (var-get platform-fee)
                )
                err-insufficient-funds
            )
            ;; Collect renewal fee from holder
            (unwrap!
                (stx-transfer? (var-get platform-fee) (get holder credential)
                    contract-owner
                )
                err-insufficient-funds
            )
            ;; Update expiry date
            (map-set credentials credential-id
                (merge credential { expiry-date: (+ stacks-block-height new-validity-duration) })
            )
            ;; Update platform fees
            (var-set total-platform-fees
                (+ (var-get total-platform-fees) (var-get platform-fee))
            )
            (ok true)
        )
    )
)

;; Credential transfer (for employment verification)
(define-public (transfer-credential
        (credential-id uint)
        (new-holder principal)
    )
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (is-eq tx-sender (get holder credential))
                err-not-authorized
            )
            (asserts! (not (get revoked credential)) err-invalid-parameter)
            (asserts! (> (get expiry-date credential) stacks-block-height)
                err-expired-credential
            )
            ;; Update old holder profile
            (let ((old-holder-profile (unwrap! (map-get? holder-profiles (get holder credential))
                    err-invalid-parameter
                )))
                (map-set holder-profiles (get holder credential)
                    (merge old-holder-profile {
                        total-credentials: (- (get total-credentials old-holder-profile) u1),
                        verified-credentials: (if (get verified credential)
                            (- (get verified-credentials old-holder-profile) u1)
                            (get verified-credentials old-holder-profile)
                        ),
                        skill-points: (- (get skill-points old-holder-profile)
                            (calculate-skill-points (get certification-level credential))
                        ),
                    })
                )
            )
            ;; Update new holder profile
            (let ((new-holder-profile (default-to {
                    total-credentials: u0,
                    verified-credentials: u0,
                    skill-points: u0,
                    profile-active: false,
                }
                    (map-get? holder-profiles new-holder)
                )))
                (map-set holder-profiles new-holder {
                    total-credentials: (+ (get total-credentials new-holder-profile) u1),
                    verified-credentials: (+ (get verified-credentials new-holder-profile)
                        (if (get verified credential)
                            u1
                            u0
                        )),
                    skill-points: (+ (get skill-points new-holder-profile)
                        (calculate-skill-points (get certification-level credential))
                    ),
                    profile-active: true,
                })
            )
            ;; Transfer credential
            (map-set credentials credential-id
                (merge credential { holder: new-holder })
            )
            (ok true)
        )
    )
)

;; SkillCert Commit 3: Marketplace and Analytics System

;; Marketplace for credential verification services
(define-map verification-requests
    uint
    {
        requester: principal,
        credential-holder: principal,
        credential-id: uint,
        verification-fee: uint,
        request-timestamp: uint,
        completed: bool,
        verified: bool,
    }
)

(define-data-var verification-counter uint u0)

;; Credential marketplace listings
(define-map credential-listings
    {
        credential-id: uint,
        holder: principal,
    }
    {
        verification-price: uint,
        available: bool,
        listed-at: uint,
    }
)

;; Analytics and reputation tracking
(define-map issuer-analytics
    principal
    {
        monthly-credentials: uint,
        revocation-rate: uint,
        average-validity-period: uint,
        last-updated: uint,
    }
)

;; Verification marketplace functions
(define-public (request-credential-verification
        (credential-holder principal)
        (credential-id uint)
        (verification-fee uint)
    )
    (let (
            (verification-id (+ (var-get verification-counter) u1))
            (credential (unwrap! (map-get? credentials credential-id)
                err-credential-not-found
            ))
        )
        (begin
            (asserts! (not (var-get contract-paused)) err-invalid-parameter)
            (asserts! (is-eq (get holder credential) credential-holder)
                err-not-authorized
            )
            (asserts! (> verification-fee u0) err-invalid-parameter)
            (asserts! (>= (stx-get-balance tx-sender) verification-fee)
                err-insufficient-funds
            )
            ;; Transfer verification fee to credential holder
            (unwrap! (stx-transfer? verification-fee tx-sender credential-holder)
                err-insufficient-funds
            )
            (map-set verification-requests verification-id {
                requester: tx-sender,
                credential-holder: credential-holder,
                credential-id: credential-id,
                verification-fee: verification-fee,
                request-timestamp: stacks-block-height,
                completed: false,
                verified: false,
            })
            (var-set verification-counter verification-id)
            (ok verification-id)
        )
    )
)

(define-public (complete-verification-request
        (verification-id uint)
        (verification-result bool)
    )
    (let ((request (unwrap! (map-get? verification-requests verification-id)
            err-not-authorized
        )))
        (begin
            (asserts! (is-eq tx-sender (get credential-holder request))
                err-not-authorized
            )
            (asserts! (not (get completed request)) err-invalid-parameter)
            (map-set verification-requests verification-id
                (merge request {
                    completed: true,
                    verified: verification-result,
                })
            )
            (ok true)
        )
    )
)

(define-public (list-credential-for-verification
        (credential-id uint)
        (verification-price uint)
    )
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (not (var-get contract-paused)) err-invalid-parameter)
            (asserts! (is-eq tx-sender (get holder credential))
                err-not-authorized
            )
            (asserts! (not (get revoked credential)) err-invalid-parameter)
            (asserts! (> (get expiry-date credential) stacks-block-height)
                err-expired-credential
            )
            (asserts! (> verification-price u0) err-invalid-parameter)
            (map-set credential-listings {
                credential-id: credential-id,
                holder: tx-sender,
            } {
                verification-price: verification-price,
                available: true,
                listed-at: stacks-block-height,
            })
            (ok true)
        )
    )
)

(define-public (purchase-verification-access
        (credential-id uint)
        (holder principal)
    )
    (let (
            (listing (unwrap!
                (map-get? credential-listings {
                    credential-id: credential-id,
                    holder: holder,
                })
                err-not-authorized
            ))
            (credential (unwrap! (map-get? credentials credential-id)
                err-credential-not-found
            ))
        )
        (begin
            (asserts! (get available listing) err-invalid-parameter)
            (asserts!
                (>= (stx-get-balance tx-sender) (get verification-price listing))
                err-insufficient-funds
            )
            ;; Transfer payment to credential holder
            (unwrap!
                (stx-transfer? (get verification-price listing) tx-sender holder)
                err-insufficient-funds
            )
            ;; Mark as purchased (could extend to track purchasers)
            (ok true)
        )
    )
)

;; Analytics and reporting functions
(define-public (update-issuer-analytics (issuer principal))
    (let ((issuer-info (unwrap! (map-get? authorized-issuers issuer) err-not-authorized)))
        (begin
            (asserts! (get verified issuer-info) err-not-verified)
            ;; Update analytics (simplified calculation)
            (map-set issuer-analytics issuer {
                monthly-credentials: (get credentials-issued issuer-info),
                revocation-rate: u0, ;; Would be calculated based on revoked credentials
                average-validity-period: u8640, ;; Simplified average
                last-updated: stacks-block-height,
            })
            (ok true)
        )
    )
)

(define-public (batch-verify-credentials (credential-ids (list 10 uint)))
    (begin
        (asserts! (is-eq tx-sender contract-owner) err-owner-only)
        (ok (map verify-single-credential credential-ids))
    )
)

(define-private (verify-single-credential (credential-id uint))
    (match (map-get? credentials credential-id)
        credential (map-set credentials credential-id (merge credential { verified: true }))
        false
    )
)

;; Read-only analytics functions
(define-read-only (get-verification-request (verification-id uint))
    (map-get? verification-requests verification-id)
)

(define-read-only (get-credential-listing
        (credential-id uint)
        (holder principal)
    )
    (map-get? credential-listings {
        credential-id: credential-id,
        holder: holder,
    })
)

(define-read-only (get-issuer-analytics (issuer principal))
    (map-get? issuer-analytics issuer)
)

(define-read-only (get-holder-skill-summary (holder principal))
    (let ((profile (unwrap! (map-get? holder-profiles holder) (err u0))))
        (ok {
            total-credentials: (get total-credentials profile),
            verified-credentials: (get verified-credentials profile),
            skill-points: (get skill-points profile),
            verification-rate: (if (> (get total-credentials profile) u0)
                (/ (* (get verified-credentials profile) u100)
                    (get total-credentials profile)
                )
                u0
            ),
        })
    )
)

(define-read-only (calculate-credential-trust-score (credential-id uint))
    (let ((credential (unwrap! (map-get? credentials credential-id) (err u0))))
        (let (
                (issuer-info (unwrap! (map-get? authorized-issuers (get issuer credential))
                    (err u0)
                ))
                (is-valid (unwrap! (is-credential-valid credential-id) (err u0)))
                (time-factor (if (> (get expiry-date credential) stacks-block-height)
                    u100
                    u0
                ))
            )
            (ok (+ (* (get reputation-score issuer-info) u10)
                ;; Issuer reputation weight
                (if is-valid
                    u300
                    u0
                )
                ;; Valid credential bonus time-factor
                ;; Time remaining factor
                (* (get certification-level credential) u50) ;; Level factor
            ))
        )
    )
)

;; Emergency and maintenance functions
(define-public (emergency-revoke-credential (credential-id uint))
    (let ((credential (unwrap! (map-get? credentials credential-id) err-credential-not-found)))
        (begin
            (asserts! (is-eq tx-sender contract-owner) err-owner-only)
            (map-set credentials credential-id
                (merge credential { revoked: true })
            )
            (ok true)
        )
    )
)

(define-public (deactivate-skill-category (category (string-utf8 32)))
    (let ((category-info (unwrap! (map-get? skill-categories category) err-invalid-parameter)))
        (begin
            (asserts! (is-eq tx-sender contract-owner) err-owner-only)
            (map-set skill-categories category
                (merge category-info { active: false })
            )
            (ok true)
        )
    )
)
