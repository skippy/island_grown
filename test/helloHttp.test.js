// During the test the env variable is set to test
// process.env.NODE_ENV = 'test'

// const Book = require('../src/app.js')

// import { app }   from '../src/app.js'
// Require the dev-dependencies
import chai from 'chai'
import chaiHttp from 'chai-http'
import server from '../src/server.js'

// import server from 'chai'
// import chai from 'chai'
// const chai = require('chai')
// const chaiHttp = require('chai-http')
// const server = require('../server')
const should = chai.should()

chai.use(chaiHttp)


describe('igBalance', () => {
    beforeEach((done) => { //Before each test we empty the database
    });
/*
  * Test the /GET route
  */
  describe('/GET igBalance', () => {
      it('it should return a 200', (done) => {
        chai.request('http://localhost:8080')
            .get('/igBalance')
            .end((err, res) => {
                  res.should.have.status(200);
                  res.body.should.be.a('array');
                  res.body.length.should.be.eql(0);
              done();
            });
      });
  });

});
