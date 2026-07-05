```javascript
// Create a WebSocket object
const socket = new WebSocket('ws://localhost:8080');

// Handle the open event
socket.onopen = () => {
  console.log('WebSocket connection open');
};

// Handle the message event
socket.onmessage = (event) => {
  console.log('Received message:', event.data);
};

// Handle the error event
socket.onerror = (error) => {
  console.error('WebSocket error:', error);
};

// Handle the close event
socket.onclose = () => {
  console.log('WebSocket connection closed');
};

// Send a message to the server
socket.send('Hello, world!');
```

**Explanation:**

* The `WebSocket` object is created with a URL of the WebSocket server. In this case, `localhost:8080`.
* The `onopen` event listener is called when the connection is opened.
* The `onmessage` event listener is called when a message is received from the server.
* The `onerror` event listener is called when there is an error with the connection.
* The `onclose` event listener