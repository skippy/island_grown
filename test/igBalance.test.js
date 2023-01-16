import chai from 'chai'
import chaiHttp from 'chai-http'

import server from '../src/server.js'

const should = chai.should()
chai.use(chaiHttp)


describe('igBalance', () => {
 /*
  * Test the /GET route
  */
  describe('/GET igBalance', () => {
  	const validVals =[
  		{email: 'someone@nope.com'},
  		{last4: 1234, exp_month: 12, exp_year: new Date().getFullYear() + 1},
  		{email: 'someone@nope.com', last4: 1234, exp_month: 12, exp_year: new Date().getFullYear() + 1}
  	]
  		validVals.forEach(validVal => {
			  it('it should return a 200 for valid values', (done) => {
			    chai.request(server)
		        .get('/igBalance')
		        .query(validVal)
		        .end((err, res) => {
		          res.should.have.status(200);
		          done();
		        });
			  });

  		})


	  // it('it should return a 200 if an email is passed in', (done) => {
	  //   chai.request(server)
    //     .get('/igBalance')
    //     .query({email: 'adam.greene@gmail.com'})
    //     .end((err, res) => {
    //       res.should.have.status(200);
    //       // res.text.should.be.eql('ig balance!')
    //       done();
    //     });
	  // });
	  describe('invalid inputs', () => {
		  it('it should return a 400 if nothing is passed in', (done) => {
		    chai.request(server)
	        .get('/igBalance')
	        .end((err, res) => {
	          res.should.have.status(400);
	          res.text.should.have.string('expected')
	          done();
	        });
		  });

		  it('it should return a 400 if an invalid email is passed in', (done) => {
		    chai.request(server)
	        .get('/igBalance')
	        .query({email: 'adam.greene@gmail'})
	        .end((err, res) => {
	          res.should.have.status(400);
	          res.text.should.be.eq('email is not valid')
	          done();
	        });
		  });

	  	const testVals = {
								 	  		 last4: '1234',
										  	 exp_month: 12,
										  	 exp_year: new Date().getFullYear() + 1
										   }
	  	for (const [key, value] of Object.entries(testVals)) {
			  it(`it should return a 400 if only ${key} is put in`, (done) => {
				    chai.request(server)
			        .get('/igBalance')
			        .query({key: value})
			        .end((err, res) => {
			          res.should.have.status(400);
			          res.text.should.be.eq('last4, exp_month, and exp_year of the credit card are expected')
			          done();
			        });
				  });
			}

	  	const invalidVals =[
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
			  it(`it should return a 400 if ${invalidParam[0]} has invalid value ${invalidParam[1]}`, (done) => {
			  		let invalidQuery = {
			  			last4: 1234,
				  		exp_month: 12,
	  					exp_year: new Date().getFullYear() + 1
					  };
			  		invalidQuery[invalidParam[0]] = invalidParam[1]
				    chai.request(server)
			        .get('/igBalance')
			        .query(invalidQuery)
			        .end((err, res) => {
			          res.should.have.status(400);
			          res.text.should.have.string(invalidParam[0])
			          done();
			        });
				  });

	  	})



	  })
  });

});

/*
tests:
- input validatations
- mixed-case email gets lower cased

*/
