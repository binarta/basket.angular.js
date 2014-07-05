describe('basket', function () {
    var fixture, ctrl, scope, dispatcher, registry, location;
    var isIteminStock = jasmine.createSpy('isIteminStock');

    beforeEach(module('basket'));
    beforeEach(module('config'));
    beforeEach(module('notifications'));
    beforeEach(module('web.storage'));
    beforeEach(module('rest.client'));
    beforeEach(module('mocks'));
    beforeEach(inject(function ($rootScope, $injector, config, topicMessageDispatcherMock, topicRegistryMock, $location) {
        fixture = {};
        config.namespace = 'active-namespace';
        config.baseUri = 'http://host/context/';
        scope = $rootScope.$new();
        dispatcher = topicMessageDispatcherMock;
        registry = topicRegistryMock;
        location = $location;
        isIteminStock.reset();
    }));

    describe('basket', function () {
        describe('given a basket reference', function () {
            var ctx;
            var onRender = inject(function (restServiceHandler) {
                fixture.basket.render(function (it) {
                    fixture.order = it;
                });
                ctx = restServiceHandler.calls[0].args[0];
            });

            beforeEach(inject(function (basket) {
                fixture.basket = basket;
            }));

            describe('on render', function () {
                beforeEach(onRender);

                it('empty basket', function () {
                    expect(fixture.order.items).toEqual([]);
                    expect(fixture.order.subTotal).toEqual(0);
                });
            });

            describe('when adding an item to the basket', function () {
                var item;
                var error = jasmine.createSpy('error');
                var success = jasmine.createSpy('success');

                beforeEach(function () {
                    item = {id: 'sale-id', price: 100, quantity: 2};
                    fixture.basket.add({item:item, success:success, error:error});
                });

                it('validate the order', inject(function(validateOrder) {
                    expect(validateOrder.calls[0].args[0]).toEqual({});
                    expect(validateOrder.calls[0].args[1].data).toEqual({
                        items: [
                            {id:'sale-id', price:100, quantity:2}
                        ]
                    });
                }));

                describe('on succesful validation', function() {
                    beforeEach(inject(function(validateOrder) {
                        validateOrder.calls[0].args[1].success();
                    }));

                    it('then the item is added to the item list', function () {
                        expect(fixture.basket.items()).toEqual([item]);
                    });

                    it('then a basket.refresh notification is raised', function () {
                        expect(dispatcher['basket.refresh']).toBeDefined();
                    });

                    it('then a basket.item.added notification is raised', function () {
                        expect(dispatcher['basket.item.added']).toBeDefined();
                    });

                    it('calculate sub total', function () {
                        expect(fixture.basket.subTotal()).toEqual(200);
                    });

                    it('success callback has been called', function() {
                        expect(success.calls[0]).toBeDefined();
                    });

                    describe('repeatedly', function () {
                        beforeEach(function () {
                            fixture.basket.add({item:item});
                        });

                        describe('with success', function() {
                            beforeEach(inject(function(validateOrder) {
                                validateOrder.calls[1].args[1].success();
                            }));

                            it('causes increments', function () {
                                expect(fixture.basket.items()).toEqual([
                                    {id: item.id, price: item.price, quantity: 4}
                                ]);
                            });

                            it('calculate sub total', function () {
                                expect(fixture.basket.subTotal()).toEqual(400);
                            });
                        });

                        describe('with rejection', function() {
                            beforeEach(inject(function(validateOrder) {
                                validateOrder.calls[1].args[0].violations = {
                                    items:{}
                                };
                                validateOrder.calls[1].args[0].violations.items[item.id] = {quantity:[{label:'upperbound', params:{boundary:0}}]};
                                validateOrder.calls[1].args[1].error();
                            }));

                            it('test', inject(function() {
                                expect(fixture.basket.items()).toEqual([
                                    {id:item.id, price:item.price, quantity:2}
                                ])
                            }));
                        });
                    });

                    describe('and any additional items', function () {
                        var item2;

                        beforeEach(inject(function(validateOrder) {
                            item2 = {id: 'sale-id-2', price: 200, quantity: 1};
                            fixture.basket.add({item:item2, success:success, error:error});
                            validateOrder.calls[1].args[1].success();
                        }));


                        describe('on render', function () {
                            beforeEach(onRender);

                            it('hydrate order', inject(function (config) {
                                expect(ctx.params.method).toEqual('POST');
                                expect(ctx.params.url).toEqual(config.baseUri + 'api/echo/purchase-order');
                                expect(ctx.params.withCredentials).toEqual(true);
                                expect(ctx.params.data).toEqual({
                                    namespace: config.namespace,
                                    items: [
                                        {id: 'sale-id', quantity: 2},
                                        {id: 'sale-id-2', quantity: 1}
                                    ]
                                });
                            }));

                            it('render order', function () {
                                ctx.success('payload');
                                expect(fixture.order).toEqual('payload');
                            });

                            it('test', inject(function(topicMessageDispatcherMock) {
                                ctx.success('payload');
                                expect(topicMessageDispatcherMock['basket.rendered']).toEqual('ok');
                            }));
                        });

                        it('are added to the item list', function () {
                            expect(fixture.basket.items()).toEqual([item, item2]);
                        });

                        it('calculate sub total', function () {
                            expect(fixture.basket.subTotal()).toEqual(400);
                        });

                        it('are flushed', inject(function (localStorage) {
                            expect(localStorage.basket).toEqual(JSON.stringify([item, item2]));
                        }));

                        describe('and updating an item', function () {
                            var updatedItem;

                            function resetSpies(spies) {
                                spies.forEach(function(it){it.reset()});
                            }

                            beforeEach(inject(function(validateOrder) {
                                resetSpies([success, error, validateOrder]);
                                dispatcher['basket.refresh'] = undefined;
                                updatedItem = {id: item.id, price: item.price, quantity: 10};
                                fixture.basket.update({item:updatedItem});
                            }));

                            it('then validate the order', inject(function(validateOrder) {
                                expect(validateOrder.calls[0].args[0]).toEqual({});
                                expect(validateOrder.calls[0].args[1].data).toEqual({items:fixture.basket.items()})
                            }));

                            it('with the updated quantity', inject(function(validateOrder) {
                                expect(validateOrder.calls[0].args[1].data.items[0]).toEqual(updatedItem);
                            }));

                            describe('with success', function() {
                                beforeEach(inject(function(validateOrder) {
                                    validateOrder.calls[0].args[1].success();
                                }));

                                it('then quantity is updated', function () {
                                    expect(fixture.basket.items()[0].quantity).toEqual(10);
                                });

                                it('then updates are flushed', inject(function (localStorage) {
                                    expect(localStorage.basket).toEqual(JSON.stringify([updatedItem, item2]));
                                }));

                                it('then a basket.refresh notification is raised', function () {
                                    expect(dispatcher['basket.refresh']).toBeDefined();
                                });

                                describe('with success callback', function() {
                                    beforeEach(inject(function(validateOrder) {
                                        resetSpies([success, error, validateOrder]);
                                        dispatcher['basket.refresh'] = undefined;
                                        updatedItem = {id: item.id, price: item.price, quantity: 10};
                                        fixture.basket.update({item:updatedItem, success:success});
                                        validateOrder.calls[0].args[1].success();
                                    }));

                                    it('success has been called', function() {
                                        expect(success.calls[0]).toBeDefined();
                                    });
                                });

                                describe('to blank', function () {
                                    beforeEach(function () {
                                        updatedItem = {id: item.id, price: item.price, quantity: ''};
                                        fixture.basket.update({item:updatedItem});
                                    });

                                    it('then quantity is unaffected', function () {
                                        expect(fixture.basket.items()[0].quantity).toEqual(10);
                                    });
                                });

                                describe('to zero', function () {
                                    beforeEach(function () {
                                        updatedItem = {id: item.id, price: item.price, quantity: 0};
                                        fixture.basket.update({item:updatedItem});
                                    });

                                    it('then quantity is unaffected', function () {
                                        expect(fixture.basket.items()[0].quantity).toEqual(10);
                                    });
                                });
                            });

                            describe('with rejection', function() {
                                beforeEach(inject(function(validateOrder) {
                                    validateOrder.calls[0].args[0].violations = {
                                        items: {
                                            'sale-id': {
                                                quantity:[{label:'upperbound', params:{boundary:0}}]
                                            }
                                        }
                                    };
                                    validateOrder.calls[0].args[1].error();
                                }));

                                it('original values are retained', function() {
                                    expect(fixture.basket.items()[0].quantity).toEqual(item.quantity);
                                });

                                describe('for different item', function() {
                                    beforeEach(inject(function(validateOrder) {
                                        validateOrder.reset();
                                        dispatcher['basket.refresh'] = undefined;
                                        updatedItem = {id: item.id, price: item.price, quantity: 10};
                                        fixture.basket.update({item:updatedItem});
                                        validateOrder.calls[0].args[0].violations = {
                                            items: {
                                                'sale-id-2': {
                                                    quantity:[{label:'upperbound', params:{boundary:0}}]
                                                }
                                            }
                                        };
                                        validateOrder.calls[0].args[1].error();
                                    }));

                                    it('then quantity is updated', function () {
                                        expect(fixture.basket.items()[0].quantity).toEqual(10);
                                    });

                                    it('then updates are flushed', inject(function (localStorage) {
                                        expect(localStorage.basket).toEqual(JSON.stringify([updatedItem, item2]));
                                    }));

                                    it('then a basket.refresh notification is raised', function () {
                                        expect(dispatcher['basket.refresh']).toBeDefined();
                                    });
                                });

                                describe('with rejection callback', function() {
                                    beforeEach(inject(function(validateOrder) {
                                        resetSpies([success, error, validateOrder]);
                                        dispatcher['basket.refresh'] = undefined;
                                        updatedItem = {id: item.id, price: item.price, quantity: 10};
                                        fixture.basket.update({item:updatedItem, error:error});
                                        validateOrder.calls[0].args[0].violations = {
                                            items: {
                                                'sale-id': {
                                                    quantity:[{label:'upperbound', params:{boundary:0}}]
                                                }
                                            }
                                        };
                                        validateOrder.calls[0].args[1].error();
                                    }));

                                    it('then callback is executed', function() {
                                        expect(error.calls[0].args[0]).toEqual({
                                            quantity:[{label:'upperbound', params:{boundary:0}}]
                                        });
                                    })
                                });

                            });
                        });

                        describe('and removing an item', function () {
                            beforeEach(function () {
                                dispatcher['basket.refresh'] = undefined;
                                fixture.basket.remove(item);
                            });

                            it('then removals are flushed', inject(function (localStorage) {
                                expect(localStorage.basket).toEqual(JSON.stringify([item2]));
                            }));

                            it('then a basket.refresh notification is raised', function () {
                                expect(dispatcher['basket.refresh']).toBeDefined();
                            });
                        });

                        describe('and clearing the basket', function () {
                            beforeEach(function () {
                                dispatcher['basket.refresh'] = undefined;
                                fixture.basket.clear();
                            });

                            it('then contents reset', function () {
                                expect(fixture.basket.items()).toEqual([]);
                                expect(fixture.basket.subTotal()).toEqual(0);
                            });

                            it('then a basket.refresh notification is raised', function () {
                                expect(dispatcher['basket.refresh']).toBeDefined();
                            });
                        });

                    })

                });

                describe('on rejection', function() {
                    beforeEach(inject(function(validateOrder) {
                        error.reset();
                        validateOrder.calls[0].args[0].violations = {items:{}};
                        validateOrder.calls[0].args[0].violations.items[item.id] = {quantity:{label:'upperbound', params:{boundary:0}}};
                        validateOrder.calls[0].args[1].error();
                    }));

                    it('the basket remains empty', function() {
                        expect(fixture.basket.items()).toEqual([]);
                    });

                    it('error callback is executed', function() {
                        expect(error.calls[0].args[0]).toEqual({quantity:{label:'upperbound', params:{boundary:0}}});
                    });

                    describe('for different item', function() {
                        beforeEach(inject(function(validateOrder) {
                            fixture.basket.add({item:item, success:success, error:error});
                            error.reset();
                            validateOrder.calls[0].args[0].violations = {
                                items:{
                                    'id-2':{quantity:[{label:'upperbound', params:{boundary:0}}]}
                                }
                            };
                            validateOrder.calls[0].args[1].error();
                        }));

                        it('error callback is not called', function() {
                            expect(error.calls[0]).toBeUndefined();
                        });

                        it('then the item is added to the item list', function () {
                            expect(fixture.basket.items()).toEqual([item]);
                        });

                        it('then a basket.refresh notification is raised', function () {
                            expect(dispatcher['basket.refresh']).toBeDefined();
                        });

                        it('then a basket.item.added notification is raised', function () {
                            expect(dispatcher['basket.item.added']).toBeDefined();
                        });

                        it('calculate sub total', function () {
                            expect(fixture.basket.subTotal()).toEqual(200);
                        });

                        it('success callback has been called', function() {
                            expect(success.calls[0]).toBeDefined();
                        });
                    });
                });
            });

            describe('when adding an item to the basket for 0 quantity', function () {
                var item;

                beforeEach(function () {
                    item = {id: 'sale-id', price: 100, quantity: 0};
                    fixture.basket.add({item:item});
                });

                it('then the item is added to the item list', function () {
                    expect(fixture.basket.items()).toEqual([]);
                });
            });

            describe('when rendering removed items', function() {
                beforeEach(inject(function() {
                    fixture.basket.add({item:{id:'item-1', quantity:1}});
                    fixture.basket.add({item:{id:'item-2', quantity:1}});
                    onRender();
                    ctx.success({items:[{id:'item-1'}]});
                }));

                it('then removed item is removed from basket and localstorage', inject(function(localStorage) {
                    expect(fixture.basket.items()).toEqual([{id:'item-1'}]);
                    expect(localStorage.basket).toEqual(JSON.stringify(fixture.basket.items()));
                }));
            });
        });
    });

    describe('ViewBasketController', function () {
        beforeEach(inject(function ($controller) {
            fixture.updateBasketPresenter = {success: jasmine.createSpy('success'), error: jasmine.createSpy('error')};
            fixture.refresh = jasmine.createSpy('refresh');
            fixture.clear = jasmine.createSpy('clear');
            fixture.update = jasmine.createSpy('update');
            fixture.remove = jasmine.createSpy('remove');
            fixture.basket = {
                render: function (presenter) {
                    presenter({
                        items: 'items',
                        additionalCharges: 'additional-charges',
                        price: 'sub-total'
                    })
                },
                items: function () {
                    return 'items'
                },
                subTotal: function () {
                    return 'sub-total'
                },
                clear: fixture.clear,
                update: fixture.update,
                remove: fixture.remove,
                refresh: fixture.refresh
            };
            ctrl = $controller(ViewBasketController, {$scope: scope, basket: fixture.basket, updateBasketPresenter:fixture.updateBasketPresenter});
        }));

        ['app.start', 'basket.refresh'].forEach(function (notification) {
            describe('on ' + notification + ' notification refresh contents', function () {
                beforeEach(function () {
                    registry[notification]();
                });

                it('expose basket state on scope', function () {
                    expect(scope.items).toEqual('items');
                    expect(scope.additionalCharges).toEqual('additional-charges');
                    expect(scope.subTotal).toEqual('sub-total');
                });
            });
        });

        describe('on init', function() {
            describe('with order validation enabled', function() {
                beforeEach(function() {
                    scope.init({validateOrder:true});
                });

                describe('on basket.rendered', function() {
                    beforeEach(function() {
                        registry['basket.rendered']();
                    });

                    it('scope is passed to order validation', inject(function(validateOrder) {
                        expect(validateOrder.calls[0].args[0]).toEqual(scope);
                    }));

                    it('basket items are passed along', inject(function(validateOrder) {
                        expect(validateOrder.calls[0].args[1].data).toEqual({
                            items: fixture.basket.items()
                        })
                    }));

                    describe('with error', function() {
                        beforeEach(inject(function(validateOrder) {
                            scope.violations = {
                                items: {
                                    'id-1': {
                                        quantity:[{label:'upperbound', params:{boundary:1}}]
                                    },
                                    'id-2': {
                                        quantity:[{label:'lowerbound', params:{boundary:2}}]
                                    }
                                }
                            };
                            validateOrder.calls[0].args[1].error();
                        }));

                        it('boundaries are extracted from violations and put on the scope', function() {
                            expect(scope.violations).toEqual({
                                items: {
                                    'id-1': {
                                        quantity: {
                                            upperbound: {boundary: 1}
                                        }
                                    },
                                    'id-2': {
                                        quantity: {
                                            lowerbound: {boundary:2}
                                        }
                                    }
                                }
                            })
                        })
                    });
                });


            });
        });

        it('clear basket', function () {
            scope.clear();
            expect(fixture.clear).toHaveBeenCalled();
        });

        describe('on update', function() {
            var updateItem = {};
            var items = [];

            beforeEach(function() {
                fixture.basket.items = function() {return items};
                updateItem = {id:'I', quantity:5};
                scope.update(updateItem);
            });

            it('update for item was called', function() {
                expect(fixture.update.calls[0].args[0].item).toEqual({id:'I', quantity:5});
            });

            describe('on success', function() {
                beforeEach(function() {
                    fixture.update.calls[0].args[0].success();
                });

                it('violations are reset', function() {
                    expect(scope.violations).toEqual({});
                });

                it('presenter presents success', function() {
                    expect(fixture.updateBasketPresenter.success.calls[0].args[0]).toEqual({$scope:scope});
                })
            });

            describe('on error', function() {
                beforeEach(function() {
                    scope.violations = {
                        items: {
                            I2: {
                                quantity: {
                                    upperbound: {boundary:2}
                                }
                            }
                        }
                    };
                    items.push({id:'I', quantity:2}, {id:'I2', quantity:4});
                    fixture.update.calls[0].args[0].error({
                        quantity:[
                            {label:'upperbound', params:{boundary:1}}
                        ]
                    });
                });

                it('violations are exposed on scope', function() {
                    expect(scope.violations).toEqual({
                        items: {
                            I: {
                                quantity: {
                                    upperbound: {boundary: 1}
                                }
                            },
                            I2: {
                                quantity: {
                                    upperbound: {boundary:2}
                                }
                            }
                        }
                    })
                });

                it('error class is exposed on scope', function() {
                    expect(scope.errorClassFor).toEqual({
                        I: {
                            quantity: 'error'
                        }
                    })
                });

                it('restore quantity to original value', function() {
                    expect(updateItem.quantity).toEqual(5);
                });

                it('update basket presenter error handler was called', function() {
                    expect(fixture.updateBasketPresenter.error.calls[0].args[0]).toEqual({
                        $scope: scope,
                        item: updateItem
                    })
                })

            });
        });

        it('remove', function () {
            scope.remove('item');
            expect(fixture.remove).toHaveBeenCalledWith('item');
        });

        describe('continue shopping', function () {
            describe('and redirectTo is in query string', function () {
                beforeEach(function () {
                    location.search('redirectTo', '/redirect-url');
                });

                it('without locale', function () {
                    scope.continue();

                    expect(location.path()).toEqual('/redirect-url');
                    expect(location.search().redirectTo).toBeUndefined();
                });

                describe('and a locale', function () {
                    beforeEach(function () {
                        scope.locale = 'lang';
                        scope.continue();
                    });

                    it('append locale to path', function () {
                        expect(location.path()).toEqual('/lang/redirect-url');
                        expect(location.search().redirectTo).toBeUndefined();
                    });
                });
            });

            describe('and redirectTo is not in query string', function () {
                beforeEach(function () {
                    location.search('redirectTo', null);
                });

                it('without locale', function () {
                    scope.continue('/path');

                    expect(location.path()).toEqual('/path');
                });

                describe('and a locale', function () {
                    beforeEach(function () {
                        scope.locale = 'lang';
                        scope.continue('/path');
                    });

                    it('append locale to path', function () {
                        expect(location.path()).toEqual('/lang/path');
                    });
                });
            });

            describe('and redirect to homepage as fallback', function () {
                beforeEach(function () {
                    location.search('redirectTo', null);
                    scope.continue();
                });

                it('without locale', function () {
                    expect(location.path()).toEqual('/');
                });
            });
        });
    });

    describe('AddToBasketController', function () {
        var items;

        beforeEach(inject(function ($controller) {
            fixture.addToBasketPresenter = {success: jasmine.createSpy('success'), error: jasmine.createSpy('error')};
            items = [];
            fixture.basket = {
                add: jasmine.createSpy('add'),
                items: function() {return items}
            };
            ctrl = $controller(AddToBasketController, {$scope: scope, basket: fixture.basket, addToBasketPresenter:fixture.addToBasketPresenter});
            scope.item = {quantity:5};
        }));

        describe('on submit', function() {
            beforeEach(function() {
                fixture.sale = {
                    id:'sale-id',
                    price:100
                };
                scope.submit(fixture.sale.id, fixture.sale.price);
            });

            it('add sale to basket', function () {
                expect(fixture.basket.add.calls[0].args[0].item).toEqual({
                    id: fixture.sale.id,
                    price: fixture.sale.price,
                    quantity: 1
                });
            });

            describe('with success', function() {
                beforeEach(function() {
                    fixture.basket.add.calls[0].args[0].success();
                });

                it('presenter presents success', function() {
                    expect(fixture.addToBasketPresenter.success.calls[0].args[0]).toEqual({$scope:scope});
                })
            });

            describe('with error', function() {
                beforeEach(function() {
                    fixture.basket.add.calls[0].args[0].error({quantity:[{label:'upperbound', params:{boundary:2}}]});
                });

                it('violation gets exposed on scope', function() {
                    expect(scope.violations).toEqual({
                        quantity: {
                            upperbound: {
                                boundary: 2
                            }
                        }
                    })
                });

                it('errorclass for is exposed', function() {
                    expect(scope.errorClassFor).toEqual({
                        quantity: 'error'
                    })
                });

                it('test', function() {
                    expect(fixture.addToBasketPresenter.error.calls[0].args[0]).toEqual({
                        $scope: scope,
                        violations: {quantity:[{label:'upperbound', params:{boundary:2}}]},
                        id: 'sale-id'
                    })
                })
            });
        });

        describe('on submit with quantity', function() {
            beforeEach(function () {
                fixture.sale = {
                    id: 'sale-id',
                    price: 100
                };
                scope.init(5);
                scope.submit(fixture.sale.id, fixture.sale.price);
            });

            it('add sale to basket', function () {
                expect(fixture.basket.add.calls[0].args[0].item).toEqual({
                    id: fixture.sale.id,
                    price: fixture.sale.price,
                    quantity: 5
                });
            });
        });
    });

    describe('PlacePurchaseOrderController', function () {
        var ctx;
        var addressSelection = jasmine.createSpyObj('addressSelection', ['view', 'clear']);
        var _window = {};

        beforeEach(inject(function ($controller) {
            scope.termsAndConditions = 'terms-and-conditions';
            ctx = {};
            ctrl = $controller(PlacePurchaseOrderController, {addressSelection: addressSelection, $scope: scope, usecaseAdapterFactory: function ($scope, success) {
                ctx.$scope = $scope;
                ctx.success = success;
                return ctx;
            }, $window: _window})
        }));

        describe('given a basket with some items', function () {
            beforeEach(inject(function (basket) {
                basket.add({item:{id: 'sale-1', price: 100, quantity: 2}});
                basket.add({item:{id: 'sale-2', price: 200, quantity: 1}});
            }));

            describe('and a locale', function () {
                beforeEach(inject(function ($routeParams) {
                    $routeParams.locale = 'lang';
                }));

                describe('and billing and shipping addresses', function () {
                    beforeEach(function () {
                        addressSelection.view.andCallFake(function (type) {
                            return {
                                label: type + '-label',
                                addressee: type + '-addressee'
                            }
                        });
                    });

                    describe('on submit', function () {
                        beforeEach(inject(function (localStorage) {
                            localStorage.provider = 'payment-provider';
                            scope.comment = 'comment';
                            scope.submit();
                        }));

                        it('perform rest call', inject(function (config, basket, restServiceHandler) {
                            expect(restServiceHandler.calls[0].args[0]).toEqual(ctx);
                            expect(ctx.$scope).toEqual(scope);
                            expect(ctx.params.method).toEqual('PUT');
                            expect(ctx.params.url).toEqual(config.baseUri + 'api/entity/purchase-order');
                            expect(ctx.params.withCredentials).toEqual(true);
                            expect(ctx.params.headers).toEqual({"Accept-Language": 'lang'});
                            expect(ctx.params.data).toEqual({
                                termsAndConditions: scope.termsAndConditions,
                                provider: 'payment-provider',
                                comment: 'comment',
                                items: [
                                    {id: 'sale-1', quantity: 2},
                                    {id: 'sale-2', quantity: 1}
                                ],
                                billing: {
                                    label: 'billing-label',
                                    addressee: 'billing-addressee'
                                },
                                shipping: {
                                    label: 'shipping-label',
                                    addressee: 'shipping-addressee'
                                },
                                reportType: 'complex'
                            });
                        }));

                        describe('success', function () {
                            beforeEach(function () {
                                scope.locale = 'locale';
                                ctx.success({});
                            });

                            describe('with an approval url', function () {
                                beforeEach(function () {
                                    ctx.success({approvalUrl: 'approval-url'});
                                });

                                it('redirect to approval url', function () {
                                    expect(location.path()).toEqual('/locale/payment-approval');
                                    expect(location.search().url).toEqual('approval-url');
                                });

                            });

                            describe('without an approval url', function () {
                                it('redirect to order confirmation', function () {
                                    expect(location.path()).toEqual('/locale/order-confirmation')
                                })
                            });

                            it('clear basket', inject(function (basket) {
                                expect(basket.items()).toEqual([]);
                            }));

                            it('clears address selection', function () {
                                expect(addressSelection.clear.calls[0]).toBeDefined();
                            });
                        });
                    });
                });

                describe('and no shipping and billing address', function () {
                    beforeEach(function () {
                        addressSelection.view.andReturn({label: null, addressee: null});
                        scope.submit();
                    });

                    it('address data is empty string', function () {
                        expect(ctx.params.data).toEqual({
                            termsAndConditions: scope.termsAndConditions,
                            items: [
                                {id: 'sale-1', quantity: 2},
                                {id: 'sale-2', quantity: 1}
                            ],
                            billing: {
                                label: '',
                                addressee: ''
                            },
                            shipping: {
                                label: '',
                                addressee: ''
                            },
                            reportType: 'complex'
                        });
                    });
                });
            });
        });
    });

    describe('AddToBasketModal', function () {
        var item = 'item';

        beforeEach(inject(function ($controller) {
            ctrl = $controller(AddToBasketModal, {$scope: scope});
        }));

        describe('on submit', function () {
            beforeEach(function () {
                scope.submit(item);
            });

            it('expose item on scope', function () {
                expect(scope.item).toEqual(item);
            });

            it('show modal', inject(function (modal) {
                expect(modal.settings).toEqual({
                    templateUrl: 'partials/basket/add.html',
                    backdrop: 'static',
                    scope: scope
                });
            }));
        });
    });

    describe('RedirectToApprovalUrlController', function () {
        var _window = {};
        beforeEach(inject(function ($controller) {
            ctrl = $controller(RedirectToApprovalUrlController, {$scope: scope, $window: _window});
        }));

        describe('given a url to redirect to', function () {
            beforeEach(function () {
                location.search('url', 'approval-url');
            });

            describe('on init', function () {
                beforeEach(function () {
                    scope.init();
                });

                it('test', function () {
                    expect(_window.location).toEqual('approval-url');
                });
            });
        });


    });
});

angular.module('mocks', [])
    .factory('validateOrder', function() {
        return jasmine.createSpy('validateOrder');
    });

angular.module('fakes', []).factory('ngRegisterTopicHandler', function(topicRegistry) {
    return function(scope, topic, handler) {
        if (topic) topicRegistry.subscribe(topic, handler);
        else {
            var args = scope;
            if (args.executeHandlerOnce) {
                var callback = function() {
                    topicRegistry.unsubscribe(args.topic, callback);
                    args.handler();
                };
                topicRegistry.subscribe(args.topic, callback);
            }
            else topicRegistry.subscribe(args.topic, args.handler);
        }
    }
});