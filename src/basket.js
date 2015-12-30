angular.module('basket', ['ngRoute', 'ui.bootstrap.modal', 'application'])
    .factory('basket', ['config', 'localStorage', 'topicMessageDispatcher', 'restServiceHandler', 'validateOrder', LocalStorageBasketFactory])
    .factory('addToBasketPresenter', [AddToBasketPresenterFactory])
    .factory('updateBasketPresenter', [UpdateBasketPresenterFactory])
    .factory('placePurchaseOrderService', ['usecaseAdapterFactory', 'addressSelection', 'config', '$routeParams', 'restServiceHandler', PlacePurchaseOrderServiceFactory])
    .controller('AddToBasketController', ['$scope', 'basket', 'addToBasketPresenter', AddToBasketController])
    .controller('ViewBasketController', ['$scope', 'basket', '$location', 'validateOrder', 'updateBasketPresenter', 'ngRegisterTopicHandler', '$timeout', '$routeParams', ViewBasketController])
    .controller('PlacePurchaseOrderController', ['$scope', 'applicationDataService', 'basket', '$location', 'addressSelection', 'localStorage', 'placePurchaseOrderService', PlacePurchaseOrderController])
    .controller('AddToBasketModal', ['$scope', '$modal', AddToBasketModal])
    .controller('RedirectToApprovalUrlController', ['$scope', '$window', '$location', RedirectToApprovalUrlController])
    .directive('basketLink', function () {
        return {
            restrict: 'A',
            controller: 'ViewBasketController',
            scope: {
                basketLink: '@'
            },
            template: '<a ng-href="#!{{localePrefix}}/basket" ng-if="quantity > 0">' +
            '<i class="fa fa-shopping-cart fa-fw"></i>' +
            '({{quantity}}) <span ng-if="basketLink == \'showSubTotal\'">{{(subTotal || 0) / 100 | currency}}</span>' +
            '</a>'
        };
    })
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

function LocalStorageBasketFactory(config, localStorage, topicMessageDispatcher, restServiceHandler, validateOrder) {
    var basket;

    function isUninitialized() {
        return !localStorage.basket;
    }

    function initialize() {
        basket = {
            items: []
        };
        flush();
    }

    function flush() {
        localStorage.basket = JSON.stringify(basket);
    }

    function rehydrate() {
        basket = JSON.parse(localStorage.basket);
    }

    function contains(it) {
        return basket.items.reduce(function (p, c) {
            return p || c.id == it.id;
        }, false)
    }

    function findItemById(id) {
        return basket.items.reduce(function (p, c) {
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
        var item = {id: it.id, price: it.price, quantity: it.quantity};
        if(it.configuration) item.configuration = it.configuration;
        basket.items.push(item);
    }

    function raiseRefreshNotification() {
        topicMessageDispatcher.fire('basket.refresh', 'ok');
    }

    function isQuantified(it) {
        return it.quantity > 0;
    }

    function removeItem(toRemove) {
        var idx = basket.items.reduce(function (p, c, i) {
            return c.id == toRemove.id ? i : p;
        }, -1);
        basket.items.splice(idx, 1);
    }

    return new function () {
        var self = this;

        if (isUninitialized()) initialize();
        rehydrate();
        function onError(scope, it, cb, success) {
            if (violationOnScopeFor(scope, it.item.id)) {
                cb();
                if (it.error) it.error(violationOnScopeFor(scope, it.item.id));
            } else success();
        }

        function violationOnScopeFor(scope, id) {
            return scope.violations.items[id];
        }

        function validate(scope, success, error) {
            validateOrder(scope, {
                data: {items: basket.items},
                success: success,
                error: error
            })
        }

        function onSuccess(it, topic) {
            flush();
            raiseRefreshNotification();
            if (topic) topicMessageDispatcher.fire(topic, 'ok');
            if (it.success) it.success();
        }

        this.refresh = function () {
            rehydrate();
        };
        this.add = function (it) {
            var scope = {};
            var success = function () {
                onSuccess(it, 'basket.item.added');
            };

            var error = function () {
                onError(scope, it, revertAdd, success);
            };

            if (isQuantified(it.item)) {
                contains(it.item) ? increment(it.item) : append(it.item);
                validate(scope, success, error);
            }

            function revertAdd() {
                var item = findItemById(it.item.id);
                if (item && item.quantity - it.item.quantity > 0) decrement(it.item);
                else removeItem(it.item);
            }
        };
        this.update = function (it) {
            var scope = {};
            var success = function () {
                onSuccess(it);
            };
            var error = function () {
                onError(scope, it, rehydrate, success);
            };
            if (isQuantified(it.item)) {
                findItemById(it.item.id).quantity = it.item.quantity + 0;
                validate(scope, success, error);
            }
        };
        this.remove = function (toRemove) {
            removeItem(toRemove);
            flush();
            raiseRefreshNotification();
        };
        this.items = function () {
            return basket.items;
        };
        this.subTotal = function () {
            var calculate = function () {
                return basket.items.reduce(function (sum, it) {
                    return sum + (it.price * it.quantity)
                }, 0);
            };
            return basket.items ? calculate() : 0;
        };
        this.render = function (presenter) {
            var couponCode = this.couponCode();
            restServiceHandler({
                params: {
                    method: 'POST',
                    url: (config.baseUri || '') + 'api/echo/purchase-order',
                    withCredentials: true,
                    data: {
                        namespace: config.namespace,
                        items: this.items().map(function (it) {
                            var item = {id: it.id, quantity: it.quantity};
                            if(it.configuration) item.configuration = it.configuration;
                            if(couponCode) {
                                item.couponCode = couponCode;
                                couponCode = undefined;
                            }
                            return item
                        })
                    }
                },
                success: function (payload) {
                    basket.items = payload.items;
                    flush();
                    payload.couponCode = self.couponCode();
                    presenter(payload);
                    topicMessageDispatcher.fire('basket.rendered', 'ok');
                }
            });
            presenter({
                couponCode: this.couponCode(),
                items: this.items(),
                subTotal: this.subTotal()
            });
        };
        this.clear = function () {
            initialize();
            raiseRefreshNotification();
        };
        this.couponCode = function (code) {
            if (code) {
                basket.coupon = code;
                flush();
            }
            return basket.coupon;
        }
    };
}

function ViewBasketController($scope, basket, $location, validateOrder, updateBasketPresenter, ngRegisterTopicHandler, $timeout, $routeParams) {
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
        },300);
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
            scope:$scope,
            topic:it,
            handler: function () {
                basket.render(function (it) {
                    $scope.items = it.items;
                    $scope.quantity = it.items.reduce(function (p, c) {
                        return p + c.quantity || 1;
                    }, 0);
                    $scope.couponCode = it.couponCode;
                    $scope.additionalCharges = it.additionalCharges;
                    $scope.itemTotal = it.itemTotal;
                    $scope.subTotal = it.price;
                });
            }
        });
    });
}

function UpdateBasketPresenterFactory() {
    return {}
}

function AddToBasketController($scope, basket, addToBasketPresenter) {
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

function PlacePurchaseOrderServiceFactory(usecaseAdapterFactory, addressSelection, config, $routeParams, restServiceHandler) {
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

        ctx.params = {
            method: 'PUT',
            url: config.baseUri + 'api/entity/purchase-order',
            withCredentials: true,
            headers: {
                'Accept-Language': $routeParams.locale
            },
            data: data
        };
        ctx.success = args.success;
        restServiceHandler(ctx);
    }
}

function PlacePurchaseOrderController($scope, common, basket, $location, addressSelection, localStorage, placePurchaseOrderService) {
    var self = this;

    this.form = {};

    this.setShippingAddress = function(it) {
        addressSelection.add('shipping', {label:it.label, addressee:it.addressee});
    };

    this.setBillingAddress = function(it) {
        addressSelection.add('billing', {label:it.label, addressee:it.addressee});
    };

    this.setPaymentProvider = function(it) {
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
                    if(it.configuration) item.configuration = it.configuration;
                    if(couponCode) {
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

    common.then(function(config) {
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
