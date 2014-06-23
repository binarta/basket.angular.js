angular.module('basket', ['ngRoute', 'ui.bootstrap.modal'])
    .factory('basket', ['config', 'localStorage', 'topicMessageDispatcher', 'restServiceHandler', 'validateOrder', LocalStorageBasketFactory])
    .controller('AddToBasketController', ['$scope', 'basket', 'topicMessageDispatcher', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', 'topicRegistry', '$location', 'topicMessageDispatcher', 'validateOrder', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', '$routeParams', 'config', 'basket', 'usecaseAdapterFactory', 'restServiceHandler', '$location', 'addressSelection', 'localStorage', '$window', PlacePurchaseOrderController])
    .controller('AddToBasketModal', ['$scope', '$modal', AddToBasketModal])
    .controller('RedirectToApprovalUrlController', ['$scope', '$window', '$location', RedirectToApprovalUrlController])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .when('/:locale/checkout', {templateUrl: 'partials/shop/checkout.html'})
            .when('/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'})
            .when('/:locale/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'});
    }]);

function LocalStorageBasketFactory(config, localStorage, topicMessageDispatcher, restServiceHandler, validateOrder) {
    var basket;

    function isUninitialized() {
        return !localStorage.basket;
    }

    function initialize() {
        basket = [];
        flush();
    }

    function flush() {
        localStorage.basket = JSON.stringify(basket);
    }

    function rehydrate() {
        basket = JSON.parse(localStorage.basket);
    }

    function contains(it) {
        return basket.reduce(function (p, c) {
            return p || c.id == it.id;
        }, false)
    }

    function findItemById(id) {
        return basket.reduce(function (p, c) {
            return p || (c.id == id ? c : null)
        }, null)
    }

    function increment(it) {
        findItemById(it.id).quantity += it.quantity;
    }

    function decrement(it) {
        findItemById(it.id).quantity -= it.quantity;
    }

    function append(it) {
        basket.push({id:it.id, price:it.price, quantity:it.quantity});
    }

    function raiseRefreshNotification() {
        topicMessageDispatcher.fire('basket.refresh', 'ok');
    }

    function isQuantified(it) {
        return it.quantity > 0;
    }

    function removeItem(toRemove) {
        var idx = basket.reduce(function(p,c,i) {
            return c.id == toRemove.id ? i : p;
        }, -1);
        basket.splice(idx, 1);
    }

    return new function () {
        if (isUninitialized()) initialize();
        rehydrate();
        this.refresh = function() {
            rehydrate();
        };
        this.add = function (it) {
            var scope = {};
            var success = function() {
                flush();
                raiseRefreshNotification();
                topicMessageDispatcher.fire('basket.item.added', 'ok');
                if (it.success) it.success();
            };

            var error = function() {
                if (violationFor(it.item.id)) {
                    revertAdd();
                    if (it.error) it.error(violationFor(it.item.id));
                }
                else success();
            };

            if (isQuantified(it.item)) {
                contains(it.item) ? increment(it.item) : append(it.item);
                validateOrder(scope, {
                    data: {items: basket},
                    success:success,
                    error: error
                });
            }

            function violationFor(id) {
                return scope.violations['items'][id]
            }

            function revertAdd() {
                var item = findItemById(it.item.id);
                if (item && item.quantity - it.item.quantity > 0) decrement(it.item);
                else removeItem(it.item);
            }
        };
        this.update = function (it) {
            var scope = {};
            function violationFor(id) {
                return scope.violations['items'][id]
            }
            var success = function() {
                flush();
                raiseRefreshNotification();
                if (it.success) it.success();
            };
            var error = function() {
                if (violationFor(it.item.id)) {
                    rehydrate();
                    if (it.error) it.error(violationFor(it.item.id));
                } else success();
            };
            if (isQuantified(it.item)) {
                findItemById(it.item.id).quantity = it.item.quantity + 0;
                validateOrder(scope, {
                    data: {
                        items:basket
                    },
                    success: success,
                    error: error
                });
            }
        };
        this.remove = function (toRemove) {
            removeItem(toRemove);
            flush();
            raiseRefreshNotification();
        };
        this.items = function () {
            return basket;
        };
        this.subTotal = function () {
            var calculate = function () {
                return basket.reduce(function (sum, it) {
                    return sum + (it.price * it.quantity)
                }, 0);
            };
            return basket ? calculate() : 0;
        };
        this.render = function (presenter) {
            restServiceHandler({
                params: {
                    method: 'POST',
                    url: (config.baseUri || '') + 'api/echo/purchase-order',
                    withCredentials: true,
                    data: {
                        namespace: config.namespace,
                        items: this.items().map(function (it) {
                            return {id: it.id, quantity: it.quantity}
                        })
                    }
                },
                success: function(payload) {
                    basket = payload.items;
                    flush();
                    presenter(payload);
                }
            });
            presenter({
                items: this.items(),
                subTotal: this.subTotal()
            });
        };
        this.clear = function () {
            initialize();
            raiseRefreshNotification();
        }
    };
}

function ViewBasketController($scope, basket, topicRegistry, $location, topicMessageDispatcher, validateOrder) {
    ['app.start', 'basket.refresh'].forEach(function (it) {
        topicRegistry.subscribe(it, function () {
            basket.render(function (it) {
                $scope.items = it.items;
                $scope.additionalCharges = it.additionalCharges;
                $scope.subTotal = it.price;
            });
        });
    });

    $scope.init = function(args) {
        if (args.validateOrder) {
            validateOrder($scope, {
                data: {
                    items: basket.items()
                },
                error: function() {
                    $scope.stock = {};
                    Object.keys($scope.violations['items']).forEach(function(id) {
                        Object.keys($scope.violations.items[id]).forEach(function(field) {
                            $scope.violations.items[id][field].forEach(function(it) {
                                if (it.label == 'upperbound') $scope.stock[id] = it.params.boundary;
                            });
                        });
                    })
                }
            });
        }
    };

    $scope.update = function (it) {
        basket.update({
            item:it,
            error: function(violation) {
                if (!$scope.stock) $scope.stock = {};
                $scope.stock[it.id] = extractStockFromQuantityViolationParams(violation);
                if ($scope.stock[it.id] == 0) topicMessageDispatcher.fire('system.warning', {msg:'item.out.of.stock', default:'The item has gone out of stock, you can subscribe to be notified when it is available again'});
                else topicMessageDispatcher.fire('system.warning', {msg:'item.quantity.upperbound', default:'The quantity for the selected item has been updated please choose a new quantity to add'});
            }
        });

        function extractStockFromQuantityViolationParams(violation) {
            return violation.quantity.reduce(function(p,c) {
                return c.label = 'upperbound' ? c.params.boundary : p;
            }, -1);
        }
    };

    $scope.remove = function (it) {
        basket.remove(it);
    };

    $scope.clear = function () {
        basket.clear();
    };

    $scope.continue = function (path) {
        if ($location.search().redirectTo) {
            $location.path(($scope.locale ? $scope.locale : '') + $location.search().redirectTo);
            $location.search('redirectTo', null);
        } else if (path) {
            $location.path(($scope.locale ? $scope.locale : '') + path);
        } else {
            $location.path('/');
        }
    };
}

function AddToBasketController($scope, basket, topicMessageDispatcher) {
    $scope.quantity = 1;

    $scope.init = function (quantity) {
        $scope.quantity = quantity;
    };

    $scope.submit = function(id, price) {
        basket.add({
            item: {id: id, price: price, quantity: $scope.quantity},
            error: function(violation) {
                var stock = extractStockFromQuantityViolationParams(violation);
                $scope.item.quantity = stock;
                if ($scope.item.quantity == 0) topicMessageDispatcher.fire('system.warning', {msg:'item.out.of.stock', default:'The item has gone out of stock, you can subscribe to be notified when it is available again'});
                else topicMessageDispatcher.fire('system.warning', {msg:'item.quantity.upperbound', default:'You chose to add more to the basket than the stock we have available, please adjust your selection'});
            }
        })
    };

    function extractStockFromQuantityViolationParams(violation) {
        return violation.quantity.reduce(function(p,c) {
            return c.label = 'upperbound' ? c.params.boundary : p;
        }, $scope.item.quantity);
    }
}

function PlacePurchaseOrderController($scope, $routeParams, config, basket, usecaseAdapterFactory, restServiceHandler, $location, addressSelection, localStorage, $window) {
    $scope.submit = function () {
        var ctx = usecaseAdapterFactory($scope);

        var billing = addressSelection.view('billing');
        var shipping = addressSelection.view('shipping');
        ctx.params = {
            method: 'PUT',
            url: config.baseUri + 'api/entity/purchase-order',
            withCredentials: true,
            headers: {
                'Accept-Language': $routeParams.locale
            },
            data: {
                termsAndConditions: $scope.termsAndConditions,
                provider: localStorage.provider,
                comment: $scope.comment,
                items: basket.items().map(function (it) {
                    return {id: it.id, quantity: it.quantity}
                }),
                billing: {
                    label: billing.label || '',
                    addressee: billing.addressee || ''
                },
                shipping: {
                    label: shipping.label || '',
                    addressee: shipping.addressee || ''
                }
            }
        };
        ctx.success = function (payload) {
            if (payload.approvalUrl) {
                $location.search('url', payload.approvalUrl);
                $location.path(($scope.locale || '') + '/payment-approval');
            } else $location.path(($scope.locale || '') + '/order-confirmation');
            basket.clear();
            addressSelection.clear();
        };
        restServiceHandler(ctx);
    }
}

function AddToBasketModal($scope, $modal) {
    $scope.submit = function (it) {
        $scope.item = it;
        $modal.open({
            templateUrl: 'partials/basket/add.html',
            backdrop: 'static',
            scope: $scope
        });
    }
}

function RedirectToApprovalUrlController($scope, $window, $location) {
    $scope.init = function () {
        $window.location = $location.search().url;
    }
}
