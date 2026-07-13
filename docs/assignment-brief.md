# Backend Developer Assignment: Business Card Scanner & Smart Contact Manager

## Objective

Build a web application that allows users to quickly create and manage contacts using Business Card OCR and Voice Input.

AI tools are allowed for completing this assignment. Backend developers who have not worked on frontend before may still be selected, but are expected to work on frontend using an AI coding agent.

## Functional Requirements

### 1. Business Card Scanner

The user can capture or upload a business card using a mobile camera.

The system should extract and populate:

- Full Name
- Designation/Title
- Company
- Email(s)
- Phone Number(s)
- Website
- Address
- Business Relationship, such as Client, Vendor, Accountant, Attorney, Contractor, Friend, etc.

### 2. Voice-Based Contact Entry

When no physical business card is available:

- The user clicks Start Speaking.
- The user speaks naturally.
- The system automatically identifies information and fills the appropriate input fields.

Example:

```text
John Smith, Sales Manager at ABC Realty.
Email john@abc.com.
Mobile 518-555-1111.
Office 518-555-2222.
Website abc.com.
Vendor.
```

### 3. Duplicate Contact Detection

While creating a contact, the system should detect existing contacts using:

- Name
- Email
- Phone

If a possible duplicate exists, the system should:

- Display matching contacts.
- Allow the user to choose one of these actions:
  - Use Existing
  - Merge
  - Create New

### 4. Contact Relationship Grouping

The system should allow multiple contacts to be linked together.

Examples:

- Husband -> Wife
- Father -> Son
- Brother -> Sister
- Business Partners
- Team Members

A contact may belong to multiple groups.

## Expected Output

The final submission should include:

- A recorded video explaining the working demo.
- Source code shared using a public Zoho Drive or Google Drive link.
- No GitHub, GitLab, or public repository link.

## Time Window

- 3 days if not currently working.
- 4 days if currently working.

## Technical Requirements

### Backend

- NestJS
- PostgreSQL
- Drizzle ORM
- REST or GraphQL APIs

### Frontend

- React
- Responsive UI
- Good UX

### Required Capabilities

- OCR using Tesseract Library
- Local Speech-to-Text library with no third-party cloud integration
- Contact merge functionality
- Unit tests

## Evaluation Criteria

- Database Design
- API Design
- Drizzle ORM Usage
- React Component Design
- Code Quality
- Validation & Error Handling
- Duplicate Detection Logic
- UX/UI
- Overall Architecture

## Submission Checklist

The submission should provide:

- Source Code
- Database Schema
- README with setup instructions
- Sample test data

## Expected Duration

The assignment is expected to take 4-8 hours for a focused MVP implementation.
