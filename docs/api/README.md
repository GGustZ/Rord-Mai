# Rord Mai API contract

> Historical learning notes. See [contract.md](contract.md) for the current consolidated API-01 specification and implementation status.

Status: Draft for team review

Application endpoints use the prfix /api/vi.
The infrastructure health endpoint uses/health

## GET /health

Purpose: Check whether the API process can respond to HTTP request

Authentication: Not required.
Request body: None.

Success status: 200 OK

Response:

{
    'data':{
        'status':'ok',
        'service':'rord-mai-api'
    }
}

This endpoint does not check database availability.
A successful response does not mean every application feature works.

## General conventions

- Request and response bodies use JSON.
- The server determines student identity from verified authentication.
- A student ID supplied in a request body is not proof of identity.
- Application routes use /api/v1.
- Successful JSON responses contrain a data field.
- Error responses contain an error object with code and message fields.
- Error codes are stable identifiers that clients can use.
- Grade and GPAX results come from the calculation engine

## Unknown endpoints

Requests that do not match a registered endpoint return 404 Not Found.

Response:

{
    'error': {
        'code':'ROUTE_NOT_FOUND',
        'message':'The requested endpoint does not exist.'
    }
}

Clients should use error.code for program logic.
The human-readable message may change.

## Request parsing and server errors

JSON request bodies must use Content-Type: application/json.

The JSON body size limit is 100 KB.

| HTTP status | Error code | Meaning |
|---|---|---|
| 400 | INVALID_JSON | The JSON request body could not be parsed |
| 413 | PAYLOAD_TOO_LARGE | The request body exceeds the size limit |
| 500 | INTERNAL_SERVER_ERROR | An unexpected server failure occurred |

Internal error details are not included in responses.

## POST /api/v1/sections/join

Status: Request validation implemented. Enrollment creation pending.

Purpose: Join an existing course section.

Request content type: application/json.

Request body:

{
  "joinCode": "ABC123"
}

Rules:

- The body must be a JSON object.
- joinCode is required and must be a string.
- Leading and trailing whitespace is removed.
- Letters are converted to uppercase.
- The normalized code must contain exactly six ASCII letters or digits.
- Additional fields are rejected.

Current responses:

| HTTP status | Error code | Meaning |
|---|---|---|
| 400 | VALIDATION_ERROR | The request fields are invalid |
| 415 | UNSUPPORTED_MEDIA_TYPE | The request is not application/json |
| 501 | NOT_IMPLEMENTED | Validation passed, but enrollment creation is pending |

Future requirements:

- Verify student identity.
- Check storage consent.
- Find the section by its join code.
- Create an enrollment for the authenticated student.
- Define success and conflict responses before implementing persistence.

# Create a course section

Status: Draft for team review.
Endpoint: POST /api/v1/sections

## Purpose

Create a shared course section with its assessment components.

The server generates the section ID, component IDs, and join code.

Student identity comes from verified authentication.
The request does not accept an ownerId or studentId.

## Request

Content-Type: application/json

{
  "courseCode": "EN123456",
  "courseName": "Example Course",
  "sectionNumber": "1",
  "academicYear": 2026,
  "semester": 1,
  "credits": 3,
  "gradingMode": "criterion",
  "withdrawalDeadline": "2026-10-30",
  "gradeThresholds": {
    "A": 80,
    "B+": 75,
    "B": 70,
    "C+": 65,
    "C": 60,
    "D+": 55,
    "D": 50
  },
  "components": [
    {
      "name": "Coursework",
      "weightPercent": 60,
      "maximumScore": 120
    },
    {
      "name": "Final examination",
      "weightPercent": 40,
      "maximumScore": 80
    }
  ]
}

These are example values, not verified university grading rules.

## Field rules

- courseCode: nonempty trimmed string, at most 30 characters.
- courseName: nonempty trimmed string, at most 200 characters.
- sectionNumber: nonempty trimmed string, at most 20 characters.
- academicYear: integer using the Gregorian year of the academic year's start.
- semester: 1, 2, or 3; 3 represents the summer semester.
- credits: positive integer.
- gradingMode: "criterion" or "norm".
- withdrawalDeadline: valid calendar date in YYYY-MM-DD format.
- components: between 1 and 30 assessment components.
- Unknown fields are rejected.

The academic-year, semester, credit, and component-limit conventions
are proposed constraints for the pilot and require team review.

## Assessment component rules

- name: nonempty trimmed string, at most 100 characters.
- weightPercent: greater than 0 and at most 100.
- weightPercent: at most two decimal places.
- maximumScore: a finite number greater than 0.
- Unknown fields are rejected.
- Component weights must total exactly 100 percent.

Validate the total using integer hundredths of a percentage point:
60 percent becomes 6000; the required total is 10000.

## Grading rules

For criterion grading:

- gradeThresholds is required.
- It contains exactly A, B+, B, C+, C, D+, and D.
- Every threshold is a finite number between 0 and 100.
- Thresholds must strictly decrease from A to D.
- A threshold is the minimum weighted percentage for that grade.
- A result below the D threshold receives F.

For norm grading:

- gradeThresholds must be null.
- The system reports weighted scores without predicting a letter grade.

## Date interpretation

withdrawalDeadline represents a calendar date in Asia/Bangkok.

It is not a timestamp.
The exact deadline time is not represented by this contract.

## Ownership and persistence

Before creating records, the server must:

1. Verify the student's identity.
2. Check storage consent.
3. Validate the request.
4. Create the section and components in one database transaction.

Whether creation also enrolls the creator must be agreed before
implementing persistence.

## Current implementation target

Implement request validation first.

- 400 VALIDATION_ERROR: valid JSON with invalid fields.
- 415 UNSUPPORTED_MEDIA_TYPE: unsupported request content type.
- 501 NOT_IMPLEMENTED: validation passed; persistence is pending.

Successful creation and conflict responses remain to be specified
before the endpoint is considered a complete API contract.
