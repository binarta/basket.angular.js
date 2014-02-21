describe('basket', function () {
    var fixture, ctrl, scope, dispatcher, registry, location;

    beforeEach(module('basket'));
    beforeEach(module('config'));
    beforeEach(module('notifications'));
    beforeEach(module('web.storage'));
    beforeEach(module('rest.client'));
    beforeEach(inject(function ($rootScope, $injector, config, topicMessageDispatcherMock, topicRegistryMock, $location) {
        fixture = {};
        config.namespace = 'active-namespace';
        config.baseUri = 'http://host/context/';
        scope = $rootScope.$new();
        dispatcher = topicMessageDispatcherMock;
        registry = topicRegistryMock;
        location = $location;
    }));

    describe('basket', function () {
        describe('given a basket reference', function () {
            var ctx;
            var onRender = inject(function(restServiceHandler) {
                fixture.basket.render(function(it) {
                    fixture.order = it;
                });
                ctx = restServiceHandler.calls[0].args[0];
            });

            beforeEach(inject(function (basket) {
                fixture.basket = basket;
            }));

            describe('on render', function() {
                beforeEach(onRender);

                it('empty basket', function() {
                    expect(fixture.order.items).toEqual([]);
                    expect(fixture.order.subTotal).toEqual(0);
                });
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

                it('then a basket.item.added notification is raised', function () {
                    expect(dispatcher['basket.item.added']).toBeDefined();
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


                    describe('on render', function() {
                        beforeEach(onRender);

                        it('hydrate order', inject(function(config) {
                            expect(ctx.params.method).toEqual('POST');
                            expect(ctx.params.url).toEqual(config.baseUri + 'api/echo/purchase-order');
                            expect(ctx.params.withCredentials).toEqual(true);
                            expect(ctx.params.data).toEqual({
                                namespace:config.namespace,
                                items: [
                                    {id: 'sale-id', quantity: 2},
                                    {id: 'sale-id-2', quantity: 1}
                                ]
                            });
                        }));

                        it('render order', function() {
                            ctx.success('payload');
                            expect(fixture.order).toEqual('payload');
                        });
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

                    describe('and updating an item', function() {
                        var updatedItem;

                        beforeEach(function() {
                            dispatcher['basket.refresh'] = undefined;
                            updatedItem = {id: item.id, price: item.price, quantity: 10};
                            fixture.basket.update(updatedItem);
                        });

                        it('then quantity is updated', function() {
                            expect(fixture.basket.items()[0].quantity).toEqual(10);
                        });

                        it('then updates are flushed', inject(function (localStorage) {
                            expect(localStorage.basket).toEqual(JSON.stringify([updatedItem, item2]));
                        }));

                        it('then a basket.refresh notification is raised', function () {
                            expect(dispatcher['basket.refresh']).toBeDefined();
                        });

                        describe('to blank', function() {
                            beforeEach(function() {
                                updatedItem = {id: item.id, price: item.price, quantity: ''};
                                fixture.basket.update(updatedItem);
                            });

                            it('then quantity is unaffected', function() {
                                expect(fixture.basket.items()[0].quantity).toEqual(item.quantity);
                            });
                        });

                        describe('to zero', function() {
                            beforeEach(function() {
                                updatedItem = {id: item.id, price: item.price, quantity: 0};
                                fixture.basket.update(updatedItem);
                            });

                            it('then quantity is unaffected', function() {
                                expect(fixture.basket.items()[0].quantity).toEqual(item.quantity);
                            });
                        });
                    });

                    describe('and removing an item', function() {
                        beforeEach(function() {
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

            describe('when adding an item to the basket for 0 quantity', function () {
                var item;

                beforeEach(function () {
                    item = {id: 'sale-id', price: 100, quantity: 0};
                    fixture.basket.add(item);
                });

                it('then the item is added to the item list', function () {
                    expect(fixture.basket.items()).toEqual([]);
                });
            });
        });
    });

    describe('ViewBasketController', function () {
        beforeEach(inject(function ($controller) {
            fixture.clear = jasmine.createSpy('clear');
            fixture.update = jasmine.createSpy('update');
            fixture.remove = jasmine.createSpy('remove');
            fixture.basket = {
                render:function(presenter) {
                    presenter({
                        items:'items',
                        price:'sub-total'
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
                remove: fixture.remove
            };
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

        it('update', function () {
            scope.update('item');
            expect(fixture.update).toHaveBeenCalledWith('item');
        });

        it('remove', function () {
            scope.remove('item');
            expect(fixture.remove).toHaveBeenCalledWith('item');
        });

        describe('continue shopping', function() {
            describe('and redirectTo is in query string', function () {
                beforeEach(function() {
                    location.search('redirectTo', '/redirect-url');
                });

                it('without locale', function() {
                    scope.continue();

                    expect(location.path()).toEqual('/redirect-url');
                    expect(location.search().redirectTo).toBeUndefined();
                });

                describe('and a locale', function () {
                    beforeEach(function () {
                        scope.locale = 'lang';
                        scope.continue();
                    });

                    it('append locale to path', function() {
                        expect(location.path()).toEqual('/lang/redirect-url');
                        expect(location.search().redirectTo).toBeUndefined();
                    });
                });
            });

            describe('and redirectTo is not in query string', function () {
                beforeEach(function() {
                    location.search('redirectTo', null);
                });

                it('without locale', function() {
                    scope.continue('/path');

                    expect(location.path()).toEqual('/path');
                });

                describe('and a locale', function () {
                    beforeEach(function () {
                        scope.locale = 'lang';
                        scope.continue('/path');
                    });

                    it('append locale to path', function() {
                        expect(location.path()).toEqual('/lang/path');
                    });
                });
            });

            describe('and redirect to homepage as fallback', function () {
                beforeEach(function() {
                    location.search('redirectTo', null);
                    scope.continue();
                });

                it('without locale', function() {
                    expect(location.path()).toEqual('/');
                });
            });
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

            it('expose quantity on scope', function () {
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
        var addressSelection = jasmine.createSpyObj('addressSelection', ['view', 'clear']);
        var _window = {}

        beforeEach(inject(function ($controller) {
            ctx = {};
            ctrl = $controller(PlacePurchaseOrderController, {addressSelection: addressSelection, $scope: scope, usecaseAdapterFactory: function ($scope, success) {
                ctx.$scope = $scope;
                ctx.success = success;
                return ctx;
            }, $window: _window})
        }));

        describe('given a basket with some items', function () {
            beforeEach(inject(function (basket) {
                basket.add({id: 'sale-1', price: 100, quantity: 2});
                basket.add({id: 'sale-2', price: 200, quantity: 1});
            }));

            describe('and a locale', function () {
                beforeEach(inject(function ($routeParams) {
                    $routeParams.locale = 'lang';
                }));

                describe('and billing and shipping addresses', function () {
                    beforeEach(function () {
                        addressSelection.view.andCallFake(function(type) {
                            return {
                                label: type + '-label',
                                addressee: type + '-addressee'
                            }
                        });
                    });

                    describe('on submit', function () {
                        beforeEach(inject(function (localStorage) {
                            localStorage.provider = 'payment-provider';
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
                                provider: 'payment-provider',
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
                                }
                            });
                        }));

                        describe('success', function () {
                            beforeEach(function() {
                                scope.locale = 'locale';
                                ctx.success({});
                            });

                            describe('with an approval url', function() {
                                beforeEach(function() {
                                    ctx.success({approvalUrl: 'approval-url'});
                                });

                                it('redirect to approval url', function() {
                                    expect(location.path()).toEqual('/locale/payment-approval');
                                    expect(location.search().url).toEqual('approval-url');
                                });

                            });

                            describe('without an approval url', function() {
                                it('redirect to order confirmation', function() {
                                    expect(location.path()).toEqual('/locale/order-confirmation')
                                })
                            });

                            it('clear basket', inject(function (basket) {
                                expect(basket.items()).toEqual([]);
                            }));

                            it('clears address selection', function() {
                                expect(addressSelection.clear.calls[0]).toBeDefined();
                            });
                        });
                    });
                });

                describe('and no shipping and billing address', function() {
                    beforeEach(function () {
                        addressSelection.view.andReturn({label: null, addressee: null});
                        scope.submit();
                    });

                    it('address data is empty string', function() {
                        expect(ctx.params.data).toEqual({
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
                            }
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
                    template: 'partials/basket/add.html',
                    show: true,
                    persist: true,
                    backdrop: 'static',
                    scope: scope
                });
            }));
        });
    });

    describe('RedirectToApprovalUrlController', function() {
        var _window = {};
        beforeEach(inject(function($controller) {
            ctrl = $controller(RedirectToApprovalUrlController, {$scope: scope, $window: _window});
        }));

        describe('given a url to redirect to', function() {
            beforeEach(function() {
                location.search('url', 'approval-url');
            });

            describe('on init', function() {
                beforeEach(function() {
                    scope.init();
                });

                it('test', function() {
                    expect(_window.location).toEqual('approval-url');
                });
            });
        });


    });
});