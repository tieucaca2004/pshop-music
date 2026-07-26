#!/usr/bin/env node
var Client = require('/tmp/node_modules/ssh2').Client;
var fs = require('fs');
var args = process.argv.slice(2);
var hostArg = args[0] || '';
var cmd = args.slice(1).join(' ');
var parts = hostArg.split('@');
var username = parts[0] || 'git';
var hostname = parts[1] ? parts[1].split(':')[0] : 'github.com';
var port = parts[1] ? (parseInt(parts[1].split(':')[1]) || 22) : 22;
var privateKey = fs.readFileSync('/home/node/.ssh/id_ed25519', 'utf8');

// Debug log
fs.appendFileSync('/tmp/git-ssh-debug.log', 'ARGS: ' + JSON.stringify(args) + '\nCMD: ' + cmd + '\n');

var conn = new Client();
var connected = false;

conn.on('ready', function() {
  connected = true;
  fs.appendFileSync('/tmp/git-ssh-debug.log', 'SSH_READY\n');
  conn.exec(cmd, {
    pty: false,
    env: {}
  }, function(err, stream) {
    if (err) {
      fs.appendFileSync('/tmp/git-ssh-debug.log', 'EXEC_ERR: ' + err.message + '\n');
      process.exit(1);
    }
    // Pipe stdin to stream
    process.stdin.pipe(stream);
    // Pipe stream to stdout/stderr
    stream.pipe(process.stdout);
    stream.stderr.pipe(process.stderr);
    // Handle close
    stream.on('close', function(code, signal) {
      fs.appendFileSync('/tmp/git-ssh-debug.log', 'CLOSE code=' + code + ' signal=' + signal + '\n');
      conn.end();
      process.exit(code || 0);
    });
  });
});

conn.on('error', function(e) {
  fs.appendFileSync('/tmp/git-ssh-debug.log', 'SSH_ERR: ' + e.message + '\n');
  process.exit(1);
});

conn.on('close', function() {
  fs.appendFileSync('/tmp/git-ssh-debug.log', 'CONN_CLOSE\n');
  if (!connected) process.exit(1);
});

conn.connect({
  host: hostname, port: port, username: username,
  privateKey: privateKey,
  readyTimeout: 15000,
  keepaliveInterval: 5000
});

setTimeout(function() {
  fs.appendFileSync('/tmp/git-ssh-debug.log', 'TIMEOUT\n');
  process.exit(1);
}, 30000);
