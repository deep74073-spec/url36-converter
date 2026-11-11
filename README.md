# URL36 Document Converter

A document conversion service by URL36.

## Features
- Browser-based document upload
- PDF, Word, Excel, PowerPoint and text formats
- LibreOffice-powered server-side conversion
- 15 MB upload limit
- Temporary processing directories

## Development

Install dependencies:

    npm install

Start the API:

    npm start

Health check:

    http://localhost:10000/api/health

## Production

The backend is designed to run in Docker with LibreOffice installed.

Set the PORT and FRONTEND_ORIGIN environment variables in production.

## Privacy

Uploaded files are processed temporarily for conversion. Do not upload confidential documents unless you are comfortable with the service's privacy and security practices.

## Project

Website: https://url36.com/
