import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, DollarSign, CreditCard, Calendar, ArrowUpRight } from "lucide-react";

export default function Payouts() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const handleRequestPayout = () => {
    toast({
      title: "Feature Coming Soon",
      description: "Payout functionality will be available with Stripe Connect integration",
    });
  };

  const handleSetupPayments = () => {
    toast({
      title: "Feature Coming Soon",
      description: "Payment setup will be available with Stripe Connect integration",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" aria-label="Loading"/>
      </div>
    );
  }

  // Mock data for demonstration
  const accountBalance = 247.83;
  const pendingBalance = 89.42;
  const minimumPayout = 50.00;
  const paymentMethodConnected = false;

  const recentPayouts = [
    {
      id: "1",
      amount: 156.78,
      date: "2025-01-15",
      status: "completed",
      method: "Bank Transfer"
    },
    {
      id: "2", 
      amount: 89.23,
      date: "2024-12-15",
      status: "completed",
      method: "Bank Transfer"
    }
  ];

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your revenue withdrawals and payment settings
          </p>
        </div>

        {/* Account Balance */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center">
                    <DollarSign className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">Available Balance</dt>
                    <dd className="text-lg font-medium text-foreground" data-testid="text-available-balance">
                      ${accountBalance.toFixed(2)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">Pending</dt>
                    <dd className="text-lg font-medium text-foreground" data-testid="text-pending-balance">
                      ${pendingBalance.toFixed(2)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">Minimum Payout</dt>
                    <dd className="text-lg font-medium text-foreground" data-testid="text-minimum-payout">
                      ${minimumPayout.toFixed(2)}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-4 h-4 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-muted-foreground truncate">Payment Method</dt>
                    <dd className="text-lg font-medium text-foreground" data-testid="text-payment-method">
                      {paymentMethodConnected ? "Connected" : "Not Setup"}
                    </dd>
                  </dl>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Payment Setup Warning */}
        {!paymentMethodConnected && (
          <Card className="mb-6 border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
            <CardContent className="pt-6">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-orange-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-orange-800 dark:text-orange-200">
                    Payment Method Required
                  </h3>
                  <div className="mt-2 text-sm text-orange-700 dark:text-orange-300">
                    <p>
                      You need to set up a payment method before you can request payouts. 
                      Connect your bank account or payment service to receive your earnings.
                    </p>
                  </div>
                  <div className="mt-4">
                    <Button 
                      onClick={handleSetupPayments}
                      variant="outline" 
                      size="sm"
                      className="border-orange-300 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-200 dark:hover:bg-orange-900"
                      data-testid="button-setup-payments"
                    >
                      Setup Payment Method
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Request Payout */}
          <Card>
            <CardHeader>
              <CardTitle>Request Payout</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Available for Withdrawal</span>
                    <span className="text-2xl font-bold text-foreground" data-testid="text-withdrawable-amount">
                      ${accountBalance.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Minimum withdrawal amount: ${minimumPayout.toFixed(2)}
                  </div>
                </div>

                {accountBalance >= minimumPayout && paymentMethodConnected ? (
                  <Button 
                    onClick={handleRequestPayout}
                    className="w-full"
                    data-testid="button-request-payout"
                  >
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Request Full Payout
                  </Button>
                ) : (
                  <Button 
                    disabled 
                    className="w-full"
                    data-testid="button-request-payout-disabled"
                  >
                    {!paymentMethodConnected 
                      ? "Setup Payment Method First"
                      : `Minimum ${minimumPayout.toFixed(2)} Required`
                    }
                  </Button>
                )}

                <div className="text-xs text-muted-foreground">
                  Payouts are typically processed within 2-5 business days
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payout History */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              {recentPayouts.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Payouts Yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Your payout history will appear here once you request your first withdrawal
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recentPayouts.map((payout) => (
                    <div key={payout.id} className="flex items-center justify-between p-3 border border-border rounded-lg" data-testid={`payout-${payout.id}`}>
                      <div>
                        <div className="font-medium text-foreground" data-testid={`text-payout-amount-${payout.id}`}>
                          ${payout.amount.toFixed(2)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(payout.date).toLocaleDateString()} • {payout.method}
                        </div>
                      </div>
                      <Badge 
                        className={payout.status === "completed" 
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                          : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                        }
                        data-testid={`badge-payout-status-${payout.id}`}
                      >
                        {payout.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Additional Information */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Payout Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-foreground mb-2">Processing Times</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Bank transfers: 2-5 business days</li>
                  <li>• PayPal: 1-2 business days</li>
                  <li>• Stripe payouts: 1-3 business days</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Payout Schedule</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Minimum payout: ${minimumPayout.toFixed(2)}</li>
                  <li>• Monthly automatic payouts available</li>
                  <li>• Manual requests processed daily</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
