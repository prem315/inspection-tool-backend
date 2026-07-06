# Inspection Tool Backend

This is the backend service for the Inspection Tool, built with [NestJS](https://nestjs.com/).

## Tech Stack

- **Framework:** NestJS
- **Database:** PostgreSQL (Neon) with Prisma ORM
- **Authentication:** JWT, Passport, bcrypt
- **Storage:** AWS S3
- **Email:** Nodemailer
- **Notifications:** Firebase Admin

## Backend Setup

Follow these steps to set up the backend development environment locally:

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/)

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory by copying the example file:
```bash
cp .env.example .env
```
Fill in the necessary values in your `.env` file:
- **App:** Port, Node environment, and CORS origin.
- **Database (Neon):** Configure your PostgreSQL connection string (`DATABASE_URL`).
- **JWT:** Set your access and refresh secrets.
- **AWS S3:** Configure your AWS region, credentials, and bucket name.
- **SendGrid:** Add your API key and from-email address.
- **Firebase:** Add your Firebase project ID, private key, and client email.

### 4. Database Setup
Generate the Prisma client and apply migrations to your database:
```bash
npx prisma generate
npx prisma db push
# or npx prisma migrate dev
```

If a seed script is available, you can populate the database:
```bash
npx prisma db seed
```

### 5. Running the Application

```bash
# development
npm run start

# watch mode (recommended for development)
npm run start:dev

# production mode
npm run start:prod
```

## Running Tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Linting and Formatting

```bash
# run eslint
npm run lint

# run prettier
npm run format
```
