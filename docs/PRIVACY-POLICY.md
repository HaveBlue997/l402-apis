# Privacy Policy

**Velocibot Agent Services**
Effective Date: March 20, 2026
Last Updated: March 20, 2026

---

## 1. The Short Version

We collect almost nothing. We don't know who you are. We don't want to know who you are.

## 2. What We Collect

For each API request, we log the following **operational metadata**:

| Data | Purpose |
|------|---------|
| **Timestamp** | Audit trail and debugging |
| **Hashed IP address** | Rate limiting and abuse prevention (we hash it — we don't store your raw IP) |
| **Model identifier** | For LLM requests: which model was used |
| **Token counts** | For LLM requests: input and output token counts for billing verification |
| **Pricing information** | Amount invoiced and payment confirmation |

That's the complete list.

## 3. What We Do NOT Collect

- **Prompts.** We do not log, store, or inspect the content of your LLM prompts.
- **Responses.** We do not log or store the content of API responses.
- **Personal information.** We do not collect names, email addresses, phone numbers, or any other personally identifiable information (PII).
- **Cookies.** We don't use cookies. We don't set cookies. There is no cookie banner because there are no cookies.
- **Accounts.** There is no registration, no login, no user profile.
- **Tracking pixels, analytics, or fingerprinting.** None.
- **Device information or browser metadata.** We don't care what device you use.

## 4. No Accounts, No PII

Our service uses the L402 protocol with Lightning Network payments. This means:

- **No accounts are created.** Every request is independently authenticated via proof of payment.
- **No registration is required.** You don't provide a name, email, or any identifying information.
- **Payments are pseudonymous.** Lightning Network payments do not inherently reveal your identity. We receive a payment hash, not your name.

We have designed our system this way on purpose. We cannot share data we do not have.

## 5. Data Retention

- **Operational audit logs** (the metadata listed in Section 2) are retained for **90 days**, then permanently deleted.
- **No content data** is retained at any point — prompts and responses are processed in memory and never written to persistent storage.

## 6. Third-Party Sharing

We do not sell, share, rent, or trade your data with any third party.

The only exception: **if legally compelled** by a valid court order, subpoena, or law enforcement request, we will provide what data we have (which is limited to the operational metadata described in Section 2). We will comply with the minimum scope of any such request.

Because we do not collect prompts or response content, we cannot provide that data even if asked.

## 7. Infrastructure

Our services run on **dedicated hardware** that we operate. Your requests are not routed through third-party cloud providers. LLM inference is performed on local models — your prompts are not sent to OpenAI, Anthropic, Google, or any other external AI provider.

## 8. Children's Privacy

Our services are not directed at individuals under 18 years of age. Because we do not collect personal information, we have no way to identify or differentiate users by age.

## 9. International Users

Our servers are located in the United States. By using our services, your API requests are processed in the United States. Because we collect only hashed IP addresses and operational metadata (no PII), international data transfer frameworks such as GDPR adequacy decisions are generally not implicated. If you have concerns about data sovereignty, please evaluate whether our service is appropriate for your use case.

## 10. Changes

We may update this Privacy Policy at any time. Changes take effect immediately upon posting. Since we have no way to contact you (see: no accounts, no email), check back if you care about changes.

## 11. Contact

Questions or concerns about this Privacy Policy? Reach us at **velocitybotholemu@gmail.com**.

---

*This Privacy Policy is provided in good faith and is not a substitute for legal counsel.*
