#!/usr/bin/env node
// Facebook Auto Post - Native OpenClaw Workflow
// Workflow Name: Facebook Auto Post
// Purpose: Publish text messages to the Pshop Music Facebook Page
// Via the Facebook Graph API.
// Credentials: App 27491382417218688, Page 232999590676675
// Invocation: node publish.js --message "Your text"
//            node publish.js --message "Test" --validate-only

const https = require('https');
const fs = require('fs');
const path = require('path');

const CREDS_FILE = path.join(__dirname, '.facebook-credentials.json');
const PAGE_ID = '232999590676675';
const API_VER = 'v21.0';
const API_HOST = 'graph.facebook.com';

function loadCreds() {
  if (!fs.existsSync(CREDS_FILE)) {
    throw new Error(
      'Credentials not found at ' + CREDS_FILE + '. ' +
      'Run the setup command to create it.'
    );
  }
  return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
}

function graph(method, endpoint, params) {
  return new Promise((resolve, reject) => {
    var qs = '';
    for (var k in params) {
      if (qs) qs += '&';
      qs += encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }
    var opts = {
      hostname: API_HOST,
      path: '/' + API_VER + endpoint + '?' + qs,
      method: method,
      headers: { 'User-Agent': 'OpenClaw-Facebook/1.0' }
    };
    var req = https.request(opts, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        try {
          var data = JSON.parse(body);
          if (res.statusCode >= 400) {
            reject(new Error((data.error && data.error.message) || 'HTTP ' + res.statusCode));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error('Parse error: ' + body.substring(0, 200)));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function publish(creds, msg) {
  var result = await graph('POST', '/' + PAGE_ID + '/feed', { message: msg, access_token: creds.pageAccessToken });
  return { postId: result.id };
}

async function main() {
  var args = process.argv.slice(2);
  var msgIdx = args.indexOf('--message');
  var msg = msgIdx !== -1 ? args[msgIdx + 1] : null;

  if (!msg) {
    console.log('Usage: node publish.js --message "Your text" [--validate-only]');
    process.exit(1);
  }
  var validateOnly = args.indexOf('--validate-only') !== -1;

  try {
    console.log('[Facebook Auto Post] Loading credentials...');
    var creds = loadCreds();

    console.log('[Facebook Auto Post] Publishing...');
    var result = await publish(creds, msg);
    console.log('[Facebook Auto Post] Published. Post ID: ' + result.postId);
    process.exit(0);
  } catch (err) {
    console.error('[Facebook Auto Post] FAILED: ' + err.message);

    if (err.message.indexOf('OAuth') >= 0 || err.message.indexOf('token') >= 0) {
      console.error('');
      console.error('=== MANUAL ACTION NEEDED ===');
      console.error('Token expired. Go to Graph API Explorer and regenerate.');
    }
    process.exit(1);
  }
}

main();
