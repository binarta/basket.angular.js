describe('basket', function () {
    var fixture, ctrl, scope, dispatcher, registry;

    beforeEach(module('basket'));
    beforeEach(module('config'));
    beforeEach(module('notifications'));
    beforeEach(module('web.storage'));
    beforeEach(module('rest.client'));
    beforeEach(inject(function ($rootScope, $injector, config, topicMessageDispatcherMock, topicRegistryMock) {
        fixture = {};
        config.namespace = 'active-namespace';
        config.baseUri = 'http://host/context/';
        scope = $rootScope.$new();
        dispatcher = topicMessageDispatcherMock;
        registry = topicRegistryMock;
    }));

    describe('basket', function () {
        describe('given a basket reference', function () {
            beforeEach(inject(function (basket) {
                fixture.basket = basket;
            }));

            it('basket is empty', function () {
                expect(fixture.basket.items()).toEqual([]);
            });

            describe('when adding an item to the basket', function () {
                var item;

                beforeEach(function () {
                    item = {id: 'sale-id', price: 100, quantity: 2};
                    fixture.basket.add(item);
                });

                it('then the item is added to the item list', function () {
                    expect(fixture.basket.items()).toEqual([item]);
                });

                it('then a basket.refresh notification is raised', function () {
                    expect(dispatcher['basket.refresh']).toBeDefined();
                });

                it('calculate sub total', function () {
                    expect(fixture.basket.subTotal()).toEqual(200);
                });

                describe('repeatedly', function () {
                    beforeEach(function () {
                        fixture.basket.add(item);
                    });

                    it('causes increments', function () {
                        expect(fixture.basket.items()).toEqual([
                            {id: item.id, price: item.price, quantity: 4}
                        ]);
                    });

                    it('calculate sub total', function () {
                        expect(fixture.basket.subTotal()).toEqual(400);
                    });
                });

                describe('and any additional items', function () {
                    var item2;

                    beforeEach(function () {
                        item2 = {id: 'sale-id-2', price: 200, quantity: 1};
                        fixture.basket.add(item2);
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
        });
    });

    describe('ViewBasketController', function () {
        beforeEach(inject(function ($controller) {
            fixture.clear = jasmine.createSpy('clear');
            fixture.basket = {items: function () {
                return 'items'
            }, subTotal: function () {
                return 'sub-total'
            }, clear: fixture.clear};
            ctrl = $controller(ViewBasketController, {$scope: scope, basket: fixture.basket});
        }));

        ['app.start', 'basket.refresh'].forEach(function (notification) {
            describe('on ' + notification + ' notification refresh contents', function () {
                beforeEach(function () {
                    registry[notification]();
                });

                it('expose basket state on scope', function () {
                    expect(scope.items).toEqual('items');
                    expect(scope.subTotal).toEqual('sub-total');
                });
            });
        });

        it('clear basket', function () {
            scope.clear();
            expect(fixture.clear).toHaveBeenCalled();
        });
    });

    describe('AddToBasketController', function () {
        beforeEach(inject(function ($controller) {
            fixture.basket = jasmine.createSpyObj('basket', ['add']);
            ctrl = $controller(AddToBasketController, {$scope: scope, basket: fixture.basket});
        }));

        describe('on submit', function () {
            beforeEach(function () {
                fixture.sale = {
                    id: 'sale-id',
                    price: 100
                };
                scope.submit(fixture.sale.id, fixture.sale.price);
            });

            it('add sale to basket', function () {
                expect(fixture.basket.add).toHaveBeenCalledWith({
                    id: fixture.sale.id,
                    price: fixture.sale.price,
                    quantity: 1
                });
            });
        });

        describe('on submit with quantity', function () {
            beforeEach(function () {
                fixture.sale = {
                    id: 'sale-id',
                    price: 100
                };
                scope.init(5);
                scope.submit(fixture.sale.id, fixture.sale.price);
            });

            it('expose quantity on scope', function() {
                expect(scope.quantity).toEqual(5);
            });

            it('add sale to basket', function () {
                expect(fixture.basket.add).toHaveBeenCalledWith({
                    id: fixture.sale.id,
                    price: fixture.sale.price,
                    quantity: 5
                });
            });
        });
    });

    describe('PlacePurchaseOrderController', function () {
        var ctx;

        beforeEach(inject(function ($controller) {
            ctx = {};
            ctrl = $controller(PlacePurchaseOrderController, {$scope: scope, usecaseAdapterFactory: function ($scope, success) {
                ctx.$scope = $scope;
                ctx.success = success;
                return ctx;
            }})
        }));

        describe('given a basket with some items', function() {
            beforeEach(inject(function(basket) {
                basket.add({id: 'sale-1', price: 100, quantity: 2});
                basket.add({id: 'sale-2', price: 200, quantity: 1});
            }));

            describe('and a locale', function() {
                beforeEach(inject(function($routeParams) {
                    $routeParams.locale = 'lang';
                }));

                describe('and billing and shipping addresses', function() {
                    beforeEach(function() {
                        scope.billing = {
                            label: 'billing-label',
                            addressee: 'billing-addressee'
                        };
                        scope.shipping = {
                            label: 'shipping-label',
                            addressee: 'shipping-addressee'
                        };
                    });

                    describe('on submit', function () {
                        beforeEach(function () {
                            scope.submit();
                        });

                        it('perform rest call', inject(function (config, basket, restServiceHandler) {
                            expect(restServiceHandler.calls[0].args[0]).toEqual(ctx);
                            expect(ctx.$scope).toEqual(scope);
                            expect(ctx.params.method).toEqual('PUT');
                            expect(ctx.params.url).toEqual(config.baseUri + 'api/entity/purchase-order');
                            expect(ctx.params.withCredentials).toEqual(true);
                            expect(ctx.params.headers).toEqual({"Accept-Language":'lang'});
                            expect(ctx.params.data).toEqual({
                                items:[
                                    {id:'sale-1', quantity:2},
                                    {id:'sale-2', quantity:1}
                                ],
                                billing: scope.billing,
                                shipping: scope.shipping
                            });
                        }));

                        describe('success', function() {
                            beforeEach(function() {
                                ctx.success();
                            });

                            it('clear basket', inject(function(basket) {
                                expect(basket.items()).toEqual([]);
                            }));
                        });
                    });
                });
            });
        });
    });

    describe('AddToBasketModal', function() {
        var item = 'item';

        beforeEach(inject(function ($controller) {
            ctrl = $controller(AddToBasketModal, {$scope: scope});
        }));

        describe('on submit', function() {
            beforeEach(function() {
                scope.submit(item);
            });

            it('expose item on scope', function() {
                expect(scope.item).toEqual(item);
            });

            it('show modal', inject(function(modal) {
                expect(modal.settings).toEqual({
                    template:'partials/basket/add.html',
                    show:true,
                    persist:true,
                    backdrop:'static',
                    scope:scope
                });
            }));
        });
    });
});