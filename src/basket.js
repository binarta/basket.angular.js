angular.module('basket', ['ngRoute', 'ui.bootstrap.modal', 'application', 'binarta-shopjs-angular1'])
    .factory('basket', ['binarta', 'topicMessageDispatcher', '$log', LocalStorageBasketFactory])
    .factory('addToBasketPresenter', [AddToBasketPresenterFactory])
    .factory('updateBasketPresenter', [UpdateBasketPresenterFactory])
    .factory('placePurchaseOrderService', ['usecaseAdapterFactory', 'addressSelection', 'binarta', '$log', PlacePurchaseOrderServiceFactory])
    .controller('AddToBasketController', ['$scope', 'basket', 'addToBasketPresenter', '$log', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', '$location', 'validateOrder', 'updateBasketPresenter', 'ngRegisterTopicHandler', '$timeout', '$routeParams', '$log', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', 'applicationDataService', 'basket', '$location', 'addressSelection', 'localStorage', 'placePurchaseOrderService', '$log', PlacePurchaseOrderController])
    .controller('AddToBasketModal', ['$scope', '$modal', AddToBasketModal])
    .controller('RedirectToApprovalUrlController', ['$scope', '$window', '$location', RedirectToApprovalUrlController])
    .directive('basketLink', ['$log', function ($log) {
        $log.warn('@deprecated basket-link attribute: use the bin-basket element instead!');
        return {
            restrict: 'A',
            controller: 'ViewBasketController',
            scope: {
                basketLink: '@'
            },
            template: '<bin-basket mode="link"></bin-basket>'
        };
    }])
    .config(['$routeProvider', function ($routeProvider) {
        $routeProvider
            .when('/:locale/checkout', {templateUrl: 'partials/shop/checkout.html'})
            .when('/payment-approval', {
                templateUrl: 'partials/shop/approval.html',
                controller: ['$scope', '$window', '$location', RedirectToApprovalUrlController]
            })
            .when('/:locale/payment-approval', {
                templateUrl: 'partials/shop/approval.html',
                controller: ['$scope', '$window', '$location', RedirectToApprovalUrlController]
            });
    }])
    .run(['topicRegistry', 'topicMessageDispatcher', 'config', function (registry, dispatcher, config) {
        function shouldInstallListenerFor(topic) {
            return !config || !config.notifications || !config.notifications.basket || config.notifications.basket[topic] != false;
        }

        if (shouldInstallListenerFor('basket.item.added'))
            registry.subscribe('basket.item.added', function () {
                dispatcher.fire('system.success', {
                    code: 'basket.item.added',
                    default: 'Item added to basket.'
                })
            });
    }]);

function LocalStorageBasketFactory(binarta, topicMessageDispatcher, $log) {
    $log.warn('@deprecated LocalStorageBasketFactory - use binarta.shop.basket instead!');
    var delegate = binarta.shop.basket;
    delegate.eventRegistry.add({
        itemAdded: function () {
            topicMessageDispatcher.fire('basket.refresh', 'ok');
            topicMessageDispatcher.fire('basket.item.added', 'ok');
        },
        itemUpdated: function () {
            topicMessageDispatcher.fire('basket.refresh', 'ok');
        },
        itemRemoved: function () {
            topicMessageDispatcher.fire('basket.refresh', 'ok');
        },
        cleared: function () {
            topicMessageDispatcher.fire('basket.refresh', 'ok');
        }
    });
    delegate.render = function (presenter) {
        $log.warn('@deprecated basket.render() - render callbacks are no longer necessary, use binarta.shop.basket instead!');
        presenter({
            couponCode: this.couponCode(),
            items: this.items(),
            subTotal: this.subTotal()
        });
        topicMessageDispatcher.fire('basket.rendered', 'ok');
    };
    return delegate;
}

function ViewBasketController($scope, basket, $location, validateOrder, updateBasketPresenter, ngRegisterTopicHandler, $timeout, $routeParams, $log) {
    $log.warn('@deprecated ViewBasketController - use bin-basket element to render the basket!');

    var config = {};

    $scope.init = function (args) {
        config.validateOrder = args.validateOrder;
    };

    $scope.update = function (it) {
        basket.update({
            item: it,
            success: function () {
                $scope.violations = {};
                if (updateBasketPresenter.success) updateBasketPresenter.success({$scope: $scope});
                $scope.updatingPrices = false;
            },
            error: function (violation) {
                function init() {
                    if (!$scope.violations) $scope.violations = {};
                    if (!$scope.violations.items) $scope.violations.items = {};
                    if (!$scope.errorClassFor) $scope.errorClassFor = {};
                    if (!$scope.errorClassFor[it.id]) $scope.errorClassFor[it.id] = {};
                    if (!$scope.violations[it.id]) $scope.violations.items[it.id] = {};
                }

                init();
                Object.keys(violation).forEach(function (field) {
                    $scope.errorClassFor[it.id][field] = 'error';
                    $scope.violations.items[it.id][field] = violation[field].reduce(function (p, c) {
                        p[c.label] = c.params;
                        return p;
                    }, {});
                });
                if (updateBasketPresenter.error) updateBasketPresenter.error({$scope: $scope, item: it});
                $scope.updatingPrices = false;
            }
        });
    };

    $scope.increaseQuantity = function (it) {
        it.quantity++;
        updatePrices(it);
    };

    $scope.decreaseQuantity = function (it) {
        if (it.quantity > 1) {
            it.quantity--;
            updatePrices(it);
        }
    };

    var updatePricesTimeout;

    function updatePrices(it) {
        $scope.updatingPrices = true;
        if (updatePricesTimeout) $timeout.cancel(updatePricesTimeout);
        updatePricesTimeout = $timeout(function () {
            $scope.update(it);
        }, 300);
    }

    $scope.remove = function (it) {
        basket.remove(it);
    };

    $scope.clear = function () {
        basket.clear();
    };

    $scope.continue = function (path) {
        if ($location.search().redirectTo) {
            $location.path(($routeParams.locale ? $routeParams.locale : '') + $location.search().redirectTo);
            $location.search('redirectTo', null);
        } else if (path) {
            $location.path(($routeParams.locale ? $routeParams.locale : '') + path);
        } else {
            $location.path('/');
        }
    };

    ngRegisterTopicHandler({
        executeHandlerOnce: true,
        scope: $scope,
        topic: 'basket.rendered',
        handler: function () {
            if (config.validateOrder) {
                validateOrder($scope, {
                    data: {
                        items: basket.items()
                    },
                    error: function () {
                        var violations = $scope.violations;

                        $scope.violations = {items: {}};
                        Object.keys(violations.items).forEach(function (id) {
                            $scope.violations.items[id] = {};
                            Object.keys(violations.items[id]).forEach(function (field) {
                                $scope.violations.items[id][field] = violations.items[id][field].reduce(function (p, c) {
                                    p[c.label] = c.params;
                                    return p;
                                }, {})
                            });
                        });
                    }
                });
            }
        }
    });

    ['app.start', 'basket.refresh'].forEach(function (it) {
        ngRegisterTopicHandler({
            scope: $scope,
            topic: it,
            handler: function () {
                basket.render(function (it) {
                    $scope.items = it.items;
                    $scope.quantity = it.items.reduce(function (p, c) {
                        return p + c.quantity || 1;
                    }, 0);
                    $scope.couponCode = it.couponCode;
                    $scope.additionalCharges = it.additionalCharges;
                    $scope.presentableItemTotal = it.presentableItemTotal;
                    $scope.presentablePrice = it.presentablePrice;
                });
            }
        });
    });
}

function UpdateBasketPresenterFactory() {
    return {}
}

function AddToBasketController($scope, basket, addToBasketPresenter, $log) {
    $log.warn('@deprecated AddToBasketController - use bin-basket element to add items to the basket!');

    $scope.quantity = 1;
    $scope.working = false;

    $scope.init = function (quantity) {
        $scope.quantity = quantity;
    };

    $scope.submit = function (id, price) {
        $scope.working = true;

        basket.add({
            item: {id: id, price: price, quantity: $scope.quantity},
            success: function () {
                if (addToBasketPresenter.success) addToBasketPresenter.success({$scope: $scope});
                $scope.working = false;
            },
            error: function (violation) {
                $scope.violations = {};
                $scope.errorClassFor = {};
                Object.keys(violation).forEach(function (field) {
                    $scope.errorClassFor[field] = 'error';
                    $scope.violations[field] = violation[field].reduce(function (p, c) {
                        p[c.label] = c.params;
                        return p;
                    }, {});
                });
                if (addToBasketPresenter.error) addToBasketPresenter.error({
                    $scope: $scope,
                    violations: violation,
                    id: id
                });
                $scope.working = false;
            }
        })
    };
}

function AddToBasketPresenterFactory() {
    return {}
}

function PlacePurchaseOrderServiceFactory(usecaseAdapterFactory, addressSelection, binarta, $log) {
    $log.warn('@deprecated PlacePurchaseOrderServiceFactory - use binarta.shop.checkout instead!');
    return function (args) {
        var $scope = args.$scope;

        var ctx = usecaseAdapterFactory($scope);

        var billing = addressSelection.view('billing');
        var shipping = addressSelection.view('shipping');

        var data = {};
        Object.keys(args.request).forEach(function (k) {
            data[k] = args.request[k];
        });
        data.reportType = 'complex';

        ctx.success = args.success;
        binarta.shop.gateway.submitOrder(data, ctx);
    }
}

function PlacePurchaseOrderController($scope, common, basket, $location, addressSelection, localStorage, placePurchaseOrderService, $log) {
    $log.warn('@deprecated PlacePurchaseOrderController - use binarta.shop.checkout instead!');
    var self = this;

    this.form = {};

    this.setShippingAddress = function (it) {
        addressSelection.add('shipping', {label: it.label, addressee: it.addressee});
    };

    this.setBillingAddress = function (it) {
        addressSelection.add('billing', {label: it.label, addressee: it.addressee});
    };

    this.setPaymentProvider = function (it) {
        this.form.paymentProvider = it;
    };

    $scope.submit = function () {
        var billing = addressSelection.view('billing');
        var shipping = addressSelection.view('shipping');
        var couponCode = basket.couponCode();
        placePurchaseOrderService({
            $scope: $scope,
            request: {
                termsAndConditions: $scope.termsAndConditions || self.form.termsAndConditions,
                provider: localStorage.provider || self.form.paymentProvider,
                comment: $scope.comment,
                items: basket.items().map(function (it) {
                    var item = {id: it.id, quantity: it.quantity};
                    if (it.configuration) item.configuration = it.configuration;
                    if (couponCode) {
                        item.couponCode = couponCode;
                        couponCode = undefined;
                    }
                    return item
                }),
                billing: {
                    label: billing.label || '',
                    addressee: billing.addressee || ''
                },
                shipping: {
                    label: shipping.label || '',
                    addressee: shipping.addressee || ''
                }
            },
            success: function (payload) {
                if (payload.approvalUrl) {
                    $location.search('url', payload.approvalUrl);
                    $location.path(($scope.locale || '') + '/payment-approval');
                } else $location.path(($scope.locale || '') + '/order-confirmation');
                basket.clear();
                addressSelection.clear();
            }
        });
    };

    common.then(function (config) {
        self.availablePaymentMethods = config.availablePaymentMethods;
    });
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
