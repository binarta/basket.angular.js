angular.module('basket', ['ngRoute', 'ui.bootstrap.modal'])
    .factory('basket', ['config', 'localStorage', 'topicMessageDispatcher', 'restServiceHandler', LocalStorageBasketFactory])
    .controller('AddToBasketController', ['$scope', 'basket', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', 'topicRegistry', '$location', 'localStorage', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', '$routeParams', 'config', 'basket', 'usecaseAdapterFactory', 'restServiceHandler', '$location', 'addressSelection', 'localStorage', '$window', PlacePurchaseOrderController])
    .controller('AddToBasketModal', ['$scope', '$modal', AddToBasketModal])
    .controller('RedirectToApprovalUrlController', ['$scope', '$window', '$location', RedirectToApprovalUrlController])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .when('/:locale/checkout', {templateUrl: 'partials/shop/checkout.html'})
            .when('/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'})
            .when('/:locale/payment-approval', {templateUrl: 'partials/shop/approval.html', controller: 'RedirectToApprovalUrlController'});
    }]);

function LocalStorageBasketFactory(config, localStorage, topicMessageDispatcher, restServiceHandler) {
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

    function append(it) {
        basket.push(it);
    }

    function raiseRefreshNotification() {
        topicMessageDispatcher.fire('basket.refresh', 'ok');
    }

    function isQuantified(it) {
        return it.quantity > 0;
    }

    return new function () {
        if (isUninitialized()) initialize();
        rehydrate();
        this.add = function (it) {
            if (isQuantified(it)) {
                contains(it) ? increment(it) : append(it);
                flush();
                raiseRefreshNotification();
                topicMessageDispatcher.fire('basket.item.added', 'ok');
            }
        };
        this.update = function (it) {
            if (isQuantified(it)) {
                findItemById(it.id).quantity = it.quantity + 0;
                flush();
                raiseRefreshNotification();
            }
        };
        this.remove = function (toRemove) {
            basket = basket.filter(function (it) {
                return it.id != toRemove.id;
            });
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
                success: presenter
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

function ViewBasketController($scope, basket, topicRegistry, $location, localStorage) {
    ['app.start', 'basket.refresh'].forEach(function (it) {
        topicRegistry.subscribe(it, function () {
            basket.render(function (it) {
                $scope.items = it.items;
                $scope.additionalCharges = it.additionalCharges;
                $scope.subTotal = it.price;
            });
        });
    });

    $scope.update = function (it) {
        basket.update(it);
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

function AddToBasketController($scope, basket) {
    $scope.quantity = 1;

    $scope.init = function (quantity) {
        $scope.quantity = quantity;
    };

    $scope.submit = function (id, price) {
        basket.add({id: id, price: price, quantity: $scope.quantity});
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
