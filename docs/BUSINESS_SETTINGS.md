# Business Settings — PSH Platform

## General Settings
- displayName, description, phone, email, website, address

## Branding
- logo (URL), coverImage, primaryColor, secondaryColor, favicon

## Localization
- timezone (default: Asia/Ho_Chi_Minh), currency (VND), country (VN), language (vi)

## AI Settings
- defaultProvider (openai), defaultModel (gpt-4o-mini), temperature, maxTokens

## Billing
- plan (starter/pro/enterprise), paymentMethod, subscriptionStatus, nextBillingDate
- invoiceEmail, taxId, billingAddress

## API
| Method | Endpoint | Action |
|--------|----------|--------|
| GET | /v1/businesses/{id}/settings | Get all settings |
| PATCH | /v1/businesses/{id}/settings/general | Update general |
| PATCH | /v1/businesses/{id}/settings/branding | Update branding |
| PATCH | /v1/businesses/{id}/settings/localization | Update localization |
| PATCH | /v1/businesses/{id}/settings/ai | Update AI config |
| PATCH | /v1/businesses/{id}/settings/billing | Update billing (owner) |
