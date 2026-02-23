# Overview
Muzika is a music distribution platform designed to empower artists, labels, and teams by simplifying music distribution, providing robust analytics, and facilitating efficient collaboration. It aims to enhance artists' reach and revenue potential by streamlining the process of uploading, distributing, and managing music releases across major streaming platforms.

# User Preferences
Preferred communication style: Simple, everyday language.

# System Architecture

## UI/UX Decisions
The frontend uses React, TypeScript, and Vite, with Shadcn/ui and Tailwind CSS for a responsive, mobile-first design. Framer-motion is used for smooth transitions. The platform supports internationalization (i18n) for English, Ukrainian, and Polish.

## Technical Implementations
- **Frontend**: React, TypeScript, Vite, Wouter, TanStack Query, Shadcn/ui, Tailwind CSS, Framer-motion, i18n.
- **Backend**: Node.js (TypeScript) with Express RESTful API, session-based authentication, and robust error handling.
- **Database**: PostgreSQL (Neon) with Drizzle ORM, supporting multi-tenancy.
- **Authentication**: Email/password via Passport.js Local Strategy with bcrypt and role-based access control.
- **User & Organization Management**: Features a two-zone architecture (Platform vs. Client), role-based access control, organization types (ARTIST_ORG, LABEL), and an organization freeze system. Includes automatic account freeze after 30 days of inactivity for organizations without paid releases (with grace period for new organizations/users).
- **File Management**: Google Drive integration for secure, proxied uploads (up to 5GB) and downloads of various media files. A chunked upload system handles large video files (up to 5GB) by splitting them into 10MB chunks, forwarding them to Google Drive's resumable upload API with automatic retries and progress tracking.
- **Quality Control System**: Implements a multi-stage review workflow (Draft → In Review → Approved → Delivering → Delivered) with admin queue management, severity tracking, and audit logging.
- **Automated Release Activation**: A scheduled task activates releases on their specified release date.
- **Notification System**: Provides bidirectional in-app, email, and Telegram notifications for various platform events.
- **Support Chat System**: A full-featured messenger system with database persistence, supporting both individual user chats and administrative oversight with unread badges and Telegram notifications.
- **Security & Trust Enhancement**: Comprehensive security headers (HSTS, X-Content-Type-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy) and RFC 9116-compliant `security.txt` and `robots.txt` are implemented.

## Feature Specifications
- **Ambassador Loyalty Program**: Offers discounted pricing tiers for selected organizations.
- **Release Creation Flow**: Multi-step wizards for audio and music video releases, including artist management, pseudonym validation, multi-language tooltips, automatic territory initialization, and extensive contributor role management. Supports Apple Music Animated Artwork with dynamic pricing and specific file requirements, and optional per-track TikTok preview dates.
- **Draft System**: Server-side draft storage with versioning, organization-scoped access control, and automatic cleanup.
- **UPC/ISRC Generation**: Manages unique product and recording codes.
- **Pitching System**: A 4-step workflow for editorial playlist placement.
- **Curator Playlist Marketplace**: Artists submit tracks to curator-managed playlists through pitching applications. Features include:
  - Application workflow with track details, Spotify links, artist photos, and custom comments
  - Curator review dashboard with status management (Pending → In Review → Approved/Rejected)
  - Structured rejection with 6 predefined reasons (genre mismatch, low quality, style mismatch, incomplete profile, insufficient stats, other) and optional curator comments
  - Artist "My Applications" page with status filtering (all/pending/in-review/approved/rejected) and application history
  - Wayforpay payment integration for approved applications
  - "Pay what you want" voluntary donation system for free playlist placements (Bandcamp-style), with WayForPay integration, curator notifications, and transaction tracking
  - In-app and Telegram notifications for application status changes
  - Server-side validation of rejection reasons against allowed enum values
- **Local Playlists System**: Admin-managed database of local Spotify playlists with Spotify API integration for data fetching and weekly synchronization.
- **Promotion System**: Includes a 4-step wizard for creating YouTube Ads campaigns with video URL validation, budget allocation, and multi-country targeting. Features a paid release gate that restricts access to promotion tools (YouTube Ads, Playlists, Pitching) for users without at least one paid release - a modal prompts them to create their first release.
- **Dashboard**: Provides a simplified interface with key statistics and recent releases.
- **Release Details Page**: Displays detailed metadata, track views, and multilink options with role-based visibility.
- **Payment Integration**: Uses Wayforpay for widget-based payment flows, including server-signed data, automatic webhook confirmation, and dynamic pricing.
- **Catalog Management**: Enhanced sorting and filtering by various criteria, with server-side pagination, search, collapsible track listings, and file download functionality.
- **Finance Tab**: Comprehensive financial management, including balance tracking, withdrawal requests, transaction history, multi-currency support, a 3-month revenue holding period, and advanced royalty withdrawal with percentage-based splits and saved bank account management.
- **Admin Panel**: Provides comprehensive tools for track metadata editing, payment status management, release activation, and full control over release and promo submissions.
- **Streaming Reports System**: Offers comprehensive analytics with admin XLS file upload, multi-organization view, advanced filtering, interactive visualizations, and an automated Google Drive import system with scheduled imports and duplicate detection. Includes an import checkpoint system for safe rollbacks. Features EUR/UAH currency toggle with per-row exchange rates. **New Report Notifications**: When a new report is imported, all organization members receive in-app notifications and Telegram messages (if configured) with period, streams count, and revenue details.
- **Royalty Systems**: Features a "Legacy" Track Royalty Allocations System linking streaming report earnings to track-level splits, and a "Simplified" Royalty System based on report-level aggregation with nano-unit precision and calendar-based holding periods. Both systems include dual-balance withdrawal mechanisms.
- **Versioned Participant Payment Details**: Allows updating participant payment details (IBAN, bank) with versioning, ensuring historical accuracy for allocations.
- **Social Media Follower Tracking**: Tracks Spotify and YouTube follower/subscriber counts with weekly automated data collection and growth metrics.
- **Quick Analytics Page**: A user-facing dashboard displaying overview, audience, short videos, and charts with period filters, Spotify Business Analytics, and YouTube integration.
- **Holiday Gift Hunt System**: A seasonal gamification feature with deterministic organization-based gift assignment, transactional claiming, and placement across key platform pages.
- **User Activity Tracking**: Automatically tracks user sessions for daily active users (DAU) and session duration analytics.
- **Platform Analytics Improvements**: Admin charts include missing dates as zeros, and new charts for Daily Active Users (DAU) and Average Session Duration are available with a flexible date range picker.
- **Royalties Analytics Tab**: Comprehensive royalty analytics in Platform Dashboard with period selection (month/year), EUR/UAH currency toggle, total revenue/streams/RPM summary cards, RPM breakdown by 8 streaming platforms (Spotify, Apple Music, YouTube, Shazam, TikTok, Deezer, Tidal, Amazon), monthly revenue chart, funds distribution pie chart (available vs frozen vs withdrawn), top 10 organizations table, and withdrawal statistics.
- **Telegram Organization Integration**: Allows organizations to connect their Telegram chats/groups to receive platform notifications. Features a secure verification code flow (MZK-XXXXXX format) with 30-minute expiry, atomic database transactions for linking, and automatic cleanup of used codes. Webhook is automatically configured on server startup.
- **Release Milestone Notifications**: Automated notifications (platform + Telegram) for key release events: (1) UPC/ISRC code assignment, (2) Pre-save link availability (id.ffm.to domain), (3) Release delivered to streaming platforms with multilink.
- **Motion Video Generator**: Admin panel tool for creating promo videos from release metadata (cover art, audio, track title, artist name). Features two animation templates (Glow Player with cover glow + player widget, and Promo Card with cover + tagline + store icons), four video formats (9:16 vertical, 1:1 square, 3:4 portrait, 16:9 landscape), customizable backgrounds (blurred art, solid color, gradient, video), streaming platform icons (Spotify, Apple Music, YouTube, TikTok, Deezer, Tidal, Amazon, Shazam), duration control (15s/30s/60s), audio start point selection, and live CSS preview. Promo Card has three layout variants: "Cover + Text" (default, shows cover art with title/tagline below), "Full Screen" (cover art centered above with large title below and platform icons), and "Text Only" (no cover art at all, only tagline/title/icons on video background — automatically forces video background type with custom upload only, hiding preset backgrounds and other background options). Server-side MP4 rendering uses node-canvas + ffmpeg with zod-validated settings. Video backgrounds feature supports two sources: preset backgrounds from a curated Google Drive folder (1l-4wi7mVZCal6BzpRlMq8rjlZAsYdcHy) and custom user-uploaded backgrounds stored in a separate folder (1hxaBEs3M2DSSqcYW9IPRj0guBUrGTNCZ). The video background rendering pipeline uses PNG frames with transparency overlaid onto the background video via ffmpeg filter_complex.
- **Academy System**: Educational content platform at /academy for artists, labels, and admins (hidden from curators). Features two content types (articles and video lectures), six categories (Marketing, Distribution, Finance, Legal, Production, Social Media), free and paid content with WayForPay integration. Individual course pages show full content for free/purchased items or a paywall with preview for paid content. Video protection includes server-proxied streaming (no direct URLs), disabled downloads, and right-click prevention. Admin management tab in admin panel allows creating, editing, publishing courses with cover image and video uploads. Database tables: academy_courses, academy_purchases.

# External Dependencies

- **Neon Database**: Serverless PostgreSQL hosting.
- **Google Drive**: External file storage.
- **Gmail**: Email notification system.
- **Telegram Bot API**: Real-time push notification system.
- **Wayforpay**: Payment gateway.
- **Spotify SDK**: For social media follower tracking and playlist integration.
- **YouTube Data API v3**: For social media follower tracking and promotion features.