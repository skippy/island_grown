import app from './app.js'
import config from './config.js'

const port = config.get('port')

app.listen(port, () => {
  console.log(`Local server listening on port ${port}`)
});

export default app;
