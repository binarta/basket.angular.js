angular.module('ui.bootstrap.tpls', []);
angular.module('ui.bootstrap.modal', [])
    .factory('modal', function () {
        return {};
    })
    .factory('$modal', ['modal', ModalFactory]);

function ModalFactory(modal) {
    return {
        open: function (settings) {
            modal.settings = settings;
        }
    }
}