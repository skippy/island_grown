// // const sinon = require('sinon')
// // const assert = require('assert')
// // require('../')

// // const getMocks = () => {
// //   const req = { body: {}, query: {} }

// //   return {
// //     req,
// //     res: {
// //       send: sinon.stub().returnsThis()
// //     }
// //   }
// // }

// // it('helloHttp: should print a name', () => {
// //   const mocks = getMocks()

// //   const helloHttp = getFunction('helloHttp')
// //   helloHttp(mocks.req, mocks.res)

// //   assert.strictEqual(mocks.res.send.calledOnceWith('Hello World!'), true)
// // })

// // import supertest from 'supertest'
// const request = require("supertest");
// const app = require("../src/server.js");
// // module.exports = app
// // module.exports = app.listen(3000);

// describe("Test the root path", () => {
//   test("It should response the GET method", done => {
//     request(app)
//       .get("/helloHttp")
//       .then(response => {
//         expect(response.statusCode).toBe(200);
//         done();
//       });
//   });
// });
// // import supertest from 'supertest'
// // import chai      from 'chai'
// // import { app }   from '../src/app.js'

// // describe("Test the root path", () => {
// //   test("It should response the GET method", done => {
// //     request(app)
// //       .get("/igBalance")
// //       .then(response => {
// //         expect(response.statusCode).toBe(200);
// //         done();
// //       });
// //   });
// // });
// // const request = supertest("http://localhost/helloHttp");
// // const expect = chai.expect;

// // describe("GET /airports", function () {
// //   it("returns all airports, limited to 30 per page", async function () {
// //     const response = await request.get("/airports");

// //     expect(response.status).to.eql(200);
// //     expect(response.body.data.length).to.eql(30);
// //   });
// // });

// // const request = require('supertest');

// // request('https://dog.ceo')
// //   .get('/api/breeds/image/random')
// //   .end(function(err, res) {
// //         if (err) throw err;
// //         console.log(res.body);
// //   });

// // describe('Random Dog Image', function() {
// //   it('responds with expected JSON structure', function(done) {
// //     request('https://dog.ceo')
// //       .get('/api/breeds/image/random')
// //       .expect(200)
// //       .expect('Content-Type', 'application/json')
// //       .expect(/{"message":".*","status":"success"}/, done);
// //   });
// // });
