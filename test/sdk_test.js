// Copyright (C) 2007-2013, GoodData(R) Corporation. All rights reserved.
describe('sdk', function() {
    describe('getReportDefinition', function() {
        it('should return report definition payload', function() {
            var rDef = sdk.getReportDefinition([
                {
                    type: 'attribute',
                    uri: '/uri1'
                }
            ]);
            var data = rDef.reportDefinition.content.grid;
            expect(data.columns.length).to.be(1);
            expect(data.columns[0]['attribute']['uri']).to.be('/uri1');
        });

        it('should return metricGroup in colums if any metric in elements', function() {
            var rDef = sdk.getReportDefinition([
                {
                    type: 'attribute',
                    uri: '/uri1'
                },
                {
                    type: 'metric',
                    uri: '/uri2'
                }
            ]);
            var data = rDef.reportDefinition.content.grid;
            expect(data.columns.length).to.be(2);
            expect(data.metrics.length).to.be(1);
            expect(data.columns[1]).to.be('metricGroup');
        });
    });

    describe("async methods:", function() {
        beforeEach(function() {
            this.server = sinon.fakeServer.create();
            this.server.autoRespond = true;
        });

        afterEach(function() {
            this.server.restore();
            delete this.server;
        });

        describe("login", function() {
            it('resolves with userLogin using valid credential', function(done) {
                this.server.respondWith(
                    'POST',
                    '/gdc/account/login',
                    [200, {'Content-Type' : 'application/json'}, JSON.stringify({"userLogin":{"profile":"/gdc/account/profile/abcd","state":"/gdc/account/login/abcd"}})]
                );

                sdk.login('login', 'pass').then(function(result) {
                    expect(result).to.eql({"userLogin": {"profile": "/gdc/account/profile/abcd", "state": "/gdc/account/login/abcd"}});
                    done();
                });
            });

            it('rejects with bad credentials', function(done) {
                this.server.respondWith(
                    'POST',
                    '/gdc/account/login',
                    [400, {'Content-Type': 'application/json'}, ""]
                );

                sdk.login('bad', 'creds').then(function() {
                    expect().fail('Promise should reject with 400 Bad Request error');
                    done();
                }, function(err) {
                    expect(err.status).to.be(400);
                    done();
                });
            });
        });

        describe("isLoggedIn", function() {
            it('should resolve if user logged in', function(done) {
                this.server.respondWith(
                    'GET', '/gdc/account/token',
                    [200, {'Content-Type': 'text/html'}, JSON.stringify({})]
                );
                sdk.isLoggedIn().then(function(result) {
                    expect(result).to.eql({});
                    done();
                }, function(err) {
                    expect().fail("Promise should be resolved with empty object");
                    done();
                });
            });
            it('should reject with 401 if user not logged in', function(done) {
                this.server.respondWith(
                    'GET', '/gdc/account/token',
                    [401, {'Content-Type': 'application/json'}, JSON.stringify({})]
                );
                sdk.isLoggedIn().then(function() {
                    expect().fail("Promise should be rejected with 401 Not Authorized");
                    done();
                }, function(err) {
                    expect(err.status).to.be(401);
                    done();
                });
            });
        });

        describe('Data Execution:', function() {
            beforeEach(function() {
                this.serverResponseMock = {
                    executionResult: {
                        columns: [
                            {
                                attributeDisplayForm: {
                                    meta: {
                                        identifier: 'attrId',
                                        uri: 'attrUri',
                                        title: 'title'
                                    }
                                }
                            },
                            {
                                metric: {
                                    meta: {
                                        identifier: 'metricId',
                                        uri: 'metricUri'
                                    },
                                    content: {
                                        format: '#00'
                                    }
                                }
                            }
                        ],
                        tabularDataResult: '/gdc/internal/projects/myFakeProjectId/experimental/executions/23452345'
                    }
                }
            });

            describe('getData', function() {
                it('should resolve with JSON with correct data', function(done) {
                    this.server.respondWith(
                        '/gdc/internal/projects/myFakeProjectId/experimental/executions',
                        [200, {'Content-Type': 'application/json'},
                        JSON.stringify(this.serverResponseMock)]
                    );
                    this.server.respondWith(
                        /\/gdc\/internal\/projects\/myFakeProjectId\/experimental\/executions\/(\w+)/,
                        [201, {'Content-Type': 'application/json'},
                        JSON.stringify({'tabularDataResult': {values: ['a', 1]}})]
                    );

                    sdk.getData('myFakeProjectId', ['attrId', 'metricId']).then(function(result) {
                        expect(result.headers[0].id).to.be('attrId');
                        expect(result.headers[1].id).to.be('metricId');
                        expect(result.rawData[0]).to.be('a');
                        expect(result.rawData[1]).to.be(1);
                        done();
                    }, function(err) {
                        expect().fail('Should resolve with CSV data');
                        done();
                    });
                });


                it('should reject when execution fails', function(done) {
                    this.server.respondWith(
                        '/gdc/internal/projects/myFakeProjectId/experimental/executions',
                        [400, {'Content-Type': 'application/json'}, JSON.stringify({'reportDefinition':{'meta': {'uri': '/foo/bar/baz'}}})]
                    );

                    sdk.getData('myFakeProjectId', ['attrId', 'metricId']).then(function(result) {
                        expect().fail('Should reject with 400');
                        done();
                    }, function(err) {
                        expect(err.status).to.be(400);
                        done();
                    });
                });

                it('should reject with 400 when data result fails', function(done) {
                    this.server.respondWith(
                        '/gdc/internal/projects/myFakeProjectId/experimental/executions',
                        [200, {'Content-Type': 'application/json'},
                        JSON.stringify(this.serverResponseMock)]
                    );
                    this.server.respondWith(
                        /\/gdc\/internal\/projects\/myFakeProjectId\/experimental\/executions\/(\w+)/,
                        [400, {'Content-Type': 'application/json'},
                        JSON.stringify({'tabularDataResult': {values: ['a', 1]}})]
                    );

                    sdk.getData('myFakeProjectId', [{type: 'metric', uri: '/metric/uri'}]).then(function(result) {
                        expect().fail('Should reject with 400');
                        done();
                    }, function(err) {
                        expect(err.status).to.be(400);
                        done();
                    });
                });
            });
        });

        describe('getCurrentProjectId', function() {
            it('should resolve with project id', function(done) {
                this.server.respondWith(
                    'GET', '',
                    [200, {'Content-Type': 'application/json'}, JSON.stringify({bootstrapResource: {current: {project: {links: {self: '/gdc/project/project_hash'}}}}})]
                );

                sdk.getCurrentProjectId().then(function(result) {
                    expect(result).to.be('project_hash');
                    done();
                }, function() {
                    expect().fail('Should resolve with project hash');
                    done();
                });
            });
        });
    });
});
