# Proxy Server for Students

A simple HTTP proxy tool designed for students to test and explore web requests.

## Files

- **proxy-server.js** - The Node.js backend proxy server
- **proxy.html** - The web interface for students

## Setup & Usage

### 1. Start the Proxy Server

```bash
node proxy-server.js
```

Output:
```
Proxy server running at http://localhost:8080
```

### 2. Access the Web Interface

Open `proxy.html` in your browser or navigate to it if it's served by a web server.

### 3. How to Use

1. Enter a target URL (e.g., `https://api.github.com/zen`)
2. Make sure the proxy server URL is correct (default: `http://localhost:8080`)
3. Click "Proxy Request"
4. View the response in the results section
5. Copy the response if needed

## Examples for Students

### Test JSON API
- URL: `https://api.github.com/zen`
- Result: Gets a random GitHub zen quote

### Test HTTP Headers
- URL: `https://httpbin.org/headers`
- Result: See what headers are sent with the request

### Test Response Status
- URL: `https://httpbin.org/status/200`
- Result: Test different HTTP status codes

### Test Request Data
- URL: `https://httpbin.org/post`
- Result: See POST request data handling

## Features

✅ Simple web interface
✅ Real-time proxy requests
✅ JSON response formatting
✅ Response copying to clipboard
✅ Error handling
✅ No authentication required

## Learning Use Cases

- **Network Requests**: Understand how HTTP requests work
- **API Testing**: Test APIs without browser restrictions
- **Web Scraping**: Fetch and analyze web content
- **Header Analysis**: Inspect HTTP headers and responses
- **Protocol Understanding**: Learn how proxies work

## Requirements

- Node.js installed
- A modern web browser
- Internet connection (for external URLs)

## Troubleshooting

**"Proxy server not responding"**
- Make sure the proxy server is running: `node proxy-server.js`
- Check the proxy server URL in the form matches where it's running

**"Access-Control" errors**
- This is expected if proxying CORS-restricted sites
- The proxy bypasses some CORS restrictions

**"Connection refused"**
- Ensure proxy-server.js is still running
- Try `http://localhost:8080` (without HTTPS)

---

Happy learning! 🚀
