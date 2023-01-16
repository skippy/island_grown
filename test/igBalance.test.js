import chai, { expect } from 'chai'
import chaiHttp from 'chai-http'
import crypto from 'crypto'

import server from '../src/server.js'
import config from '../src/config.js'

const should = chai.should()
chai.use(chaiHttp)

describe('/GET igBalance', () => {
  const validVals = [
    { email: 'someone@nope.com' },
    { last4: 1234, exp_month: 12, exp_year: new Date().getFullYear() + 1 },
    { email: 'someone@nope.com', last4: 1234, exp_month: 12, exp_year: new Date().getFullYear() + 1 }
  ]
  validVals.forEach(validVal => {
    it('should return a 200 for valid values', (done) => {
      chai.request(server)
        .get('/igBalance')
        .query(validVal)
        .end((err, res) => {
          res.should.have.status(200)
          done()
        })
    })
  })

  it('should return an empty authorizations and balance object if the cardholder has no transactions', async () => {
    const res = await chai.request(server)
      .get('/igBalance')
	    .query({ email: global.emptyCardholderEmail })
    res.should.have.status(200)
    JSON.parse(res.text).should.eql({
	    spending_limit: 100,
      total_spent: 0,
      remaining_amt: 100,
      authorizations: []
    })
  })

  it('should return an authorizations and balance object if the cardholder has transactions', async () => {
    const res = await chai.request(server)
      .get('/igBalance')
	    .query({ email: global.transactionsCardholderEmail })
    res.should.have.status(200)
    const responseObj = JSON.parse(res.text)
    responseObj.spending_limit.should.eql(100)
    responseObj.total_spent.should.eql(20)
    responseObj.remaining_amt.should.eql(80)
    responseObj.authorizations.length.should.eql(1)
    Object.keys(responseObj.authorizations[0]).sort().should.eql(['amount', 'created_at', 'merchant'])
    responseObj.authorizations[0].amount.should.eql(20)
    responseObj.authorizations[0].created_at.should.not.empty
    Object.keys(responseObj.authorizations[0].merchant).sort().should.eql(['city', 'name', 'postal_code', 'state'])
    responseObj.authorizations[0].merchant.city.should.not.empty
    responseObj.authorizations[0].merchant.name.should.not.empty
    responseObj.authorizations[0].merchant.postal_code.should.not.empty
    responseObj.authorizations[0].merchant.state.should.not.empty
  })

  describe('describe invalid inputs', () => {
	  it('should return a 400 if nothing is passed in', (done) => {
	    chai.request(server)
        .get('/igBalance')
        .end((err, res) => {
          res.should.have.status(400)
          res.text.should.have.string('expected')
          done()
        })
	  })

	  it('should return a 400 if an invalid email is passed in', (done) => {
	    chai.request(server)
        .get('/igBalance')
        .query({ email: 'adam.greene@gmail' })
        .end((err, res) => {
          res.should.have.status(400)
          res.text.should.be.eq('email is not valid')
          done()
        })
	  })

  	const testVals = {
  		last4: '1234',
	  	exp_month: 12,
	  	exp_year: new Date().getFullYear() + 1
	  }
  	for (const [key, value] of Object.entries(testVals)) {
		  it(`should return a 400 if only ${key} is put in`, (done) => {
			    chai.request(server)
		        .get('/igBalance')
		        .query({ key: value })
		        .end((err, res) => {
		          res.should.have.status(400)
		          res.text.should.be.eq('last4, exp_month, and exp_year of the credit card are expected')
		          done()
		        })
			  })
    }

  	const invalidVals = [
 		 	['last4', 123],
 		 	['last4', 'abcd'],
 		 	['last4', '12'],
 		  ['last4', 12345],
  	  ['exp_month', 13],
  	  ['exp_month', '13'],
  	  ['exp_month', 'a'],
  	  ['exp_month', 'a   '],
  	  ['exp_year', '13'],
  	  ['exp_year', '23'],
  	  ['exp_year', '25'],
  	  ['exp_year', 26],
  	  ['exp_year', new Date().getFullYear() + 20],
  	  ['exp_year', new Date().getFullYear() - 1]
    ]
  	invalidVals.forEach(invalidParam => {
		  it(`should return a 400 if ${invalidParam[0]} has invalid value ${invalidParam[1]}`, (done) => {
		  		const invalidQuery = {
		  			last4: 1234,
			  		exp_month: 12,
  					exp_year: new Date().getFullYear() + 1
				  }
		  		invalidQuery[invalidParam[0]] = invalidParam[1]
			    chai.request(server)
		        .get('/igBalance')
		        .query(invalidQuery)
		        .end((err, res) => {
		          res.should.have.status(400)
		          res.text.should.have.string(invalidParam[0])
		          done()
		        })
			  })
  	})
  })
})
