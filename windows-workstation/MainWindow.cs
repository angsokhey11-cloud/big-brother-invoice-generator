using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace BBInvoiceWorkstation;

/// <summary>
/// A separate Windows TEST workstation. The original Invoice Generator runs
/// unchanged in its own WebView2; external websites run as TOP-LEVEL pages in
/// another WebView2 with a persistent, device-local browser profile.
/// No host-object bridge to the invoice or external websites is provided.
/// </summary>
internal sealed class MainWindow : Window
{
    private const string DefaultInvoiceUrl =
        "https://angsokhey11-cloud.github.io/big-brother-invoice-generator/";
    private const string TelegramUrl = "https://web.telegram.org/";

    private readonly WorkstationSettings _preferences = SettingsStore.Load();
    private readonly WebView2CompositionControl _invoiceView = new();
    private readonly WebView2CompositionControl _browserView = new();
    private readonly Canvas _overlay = new();
    private readonly Border _browserPanel = new();
    private readonly Button _bubble = new();
    private readonly TextBox _invoiceAddress = new();
    private readonly TextBox _browserAddress = new();
    private readonly ComboBox _savedWebsites = new();
    private readonly TextBlock _notice = new();
    private readonly TextBlock _invoiceStatus = new();
    private readonly Grid _body = new();

    private bool _browserReady;
    private bool _browserStarting;
    private bool _panelOpen;
    private bool _dragging;
    private Point _dragFrom;
    private Point _panelFrom;

    // CSS affects ONLY this Windows test shell, not the production website.
    private const string HideWebInvoiceBubbleScript = """
        (function(){
          function hideOldBubble(){
            if(!document.documentElement || document.getElementById('bbNativeShellHideBrowser')) return;
            var css=document.createElement('style');
            css.id='bbNativeShellHideBrowser';
            css.textContent='#bbInvoiceBrowserBubble,#bbInvoiceBrowserPanel{display:none!important}';
            (document.head || document.documentElement).appendChild(css);
          }
          hideOldBubble();
          document.addEventListener('DOMContentLoaded',hideOldBubble);
          setInterval(hideOldBubble,1800);
        })();
        """;

    public MainWindow()
    {
        Title = "BIG BROTHER — Invoice Workstation • Windows Browser Test";
        Width = 1380;
        Height = 880;
        MinWidth = 840;
        MinHeight = 580;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Background = Paint("#edf2f9");
        FontFamily = new FontFamily("Segoe UI");

        BuildWindow();
        Loaded += async (_, _) => await InitializeInvoiceAsync();
        Closing += (_, _) =>
        {
            RememberPanel();
            _preferences.InvoiceUrl = SettingsStore.RememberableUrl(_invoiceAddress.Text);
            SettingsStore.Save(_preferences);
        };
    }

    private static Brush Paint(string hex) =>
        new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex)!);

    private static TextBlock Text(string text, double size, string color, FontWeight? weight = null) =>
        new()
        {
            Text = text, FontSize = size, Foreground = Paint(color),
            FontWeight = weight ?? FontWeights.Normal,
            VerticalAlignment = VerticalAlignment.Center
        };

    private static Button MakeButton(string label, string background = "#e8f1fc",
        string foreground = "#194a87", double fontSize = 12, double width = 0)
    {
        var b = new Button
        {
            Content = label, Background = Paint(background),
            Foreground = Paint(foreground), FontWeight = FontWeights.SemiBold,
            FontSize = fontSize, Height = 34,
            Padding = new Thickness(11, 4, 11, 4),
            BorderBrush = Paint("#c4d5eb"), BorderThickness = new Thickness(1),
            VerticalAlignment = VerticalAlignment.Center,
            Margin = new Thickness(0, 0, 6, 0),
            Cursor = Cursors.Hand
        };
        if (width > 0) b.Width = width;
        return b;
    }

    private static TextBox MakeAddressBox()
    {
        return new TextBox
        {
            Height = 34, FontSize = 12, Background = Brushes.White,
            Foreground = Paint("#193653"), BorderBrush = Paint("#b9cbe0"),
            BorderThickness = new Thickness(1),
            Padding = new Thickness(9, 7, 8, 4),
            VerticalContentAlignment = VerticalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center
        };
    }

    private void BuildWindow()
    {
        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(95) });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        Content = root;

        var header = new Grid { Background = Paint("#174888") };
        header.RowDefinitions.Add(new RowDefinition { Height = new GridLength(39) });
        header.RowDefinitions.Add(new RowDefinition { Height = new GridLength(56) });
        Grid.SetRow(header, 0);
        root.Children.Add(header);

        var titleRow = new DockPanel { Margin = new Thickness(16, 7, 16, 0) };
        titleRow.Children.Add(Text("BIG BROTHER  /  INVOICE WORKSTATION", 15, "#ffffff", FontWeights.Bold));
        var testFlag = Text("TEST BUILD  •  Live invoice saves remain enabled!", 11, "#ffdfac", FontWeights.SemiBold);
        DockPanel.SetDock(testFlag, Dock.Right);
        titleRow.Children.Insert(0, testFlag);
        Grid.SetRow(titleRow, 0);
        header.Children.Add(titleRow);

        var navRow = new Grid { Margin = new Thickness(16, 2, 16, 8) };
        navRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        navRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        navRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        navRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        navRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(250) });
        Grid.SetRow(navRow, 1);
        header.Children.Add(navRow);

        var invoiceLabel = Text("Invoice URL", 12, "#e5eefb", FontWeights.SemiBold);
        invoiceLabel.Margin = new Thickness(0, 0, 10, 0);
        Grid.SetColumn(invoiceLabel, 0);
        navRow.Children.Add(invoiceLabel);

        var originalUrl = SettingsStore.TryWebAddress(_preferences.InvoiceUrl, out var savedUrl)
            ? savedUrl.AbsoluteUri : DefaultInvoiceUrl;
        _invoiceAddress.Text = originalUrl;
        _invoiceAddress.Margin = new Thickness(0, 0, 8, 0);
        Grid.SetColumn(_invoiceAddress, 1);
        navRow.Children.Add(_invoiceAddress);
        _invoiceAddress.KeyDown += (_, e) =>
        {
            if (e.Key == Key.Enter) { NavigateInvoice(); e.Handled = true; }
        };

        var load = MakeButton("Load invoice", "#2672d1", "#ffffff", 12, 111);
        load.Click += (_, _) => NavigateInvoice();
        Grid.SetColumn(load, 2);
        navRow.Children.Add(load);

        var cloud = MakeButton("Cloud", "#e8f1fc", "#174888", 12, 72);
        cloud.Click += (_, _) => { _invoiceAddress.Text = DefaultInvoiceUrl; NavigateInvoice(); };
        Grid.SetColumn(cloud, 3);
        navRow.Children.Add(cloud);

        _invoiceStatus.Text = "Opening invoice workspace…";
        _invoiceStatus.FontSize = 11;
        _invoiceStatus.Foreground = Paint("#dfebfb");
        _invoiceStatus.VerticalAlignment = VerticalAlignment.Center;
        _invoiceStatus.TextTrimming = TextTrimming.CharacterEllipsis;
        Grid.SetColumn(_invoiceStatus, 4);
        navRow.Children.Add(_invoiceStatus);

        Grid.SetRow(_body, 1);
        _body.ClipToBounds = true;
        root.Children.Add(_body);

        _invoiceView.DefaultBackgroundColor = System.Drawing.Color.White;
        _body.Children.Add(_invoiceView);

        // A canvas without a background lets clicks pass through empty space to
        // the Invoice WebView. Only the native bubble/panel captures input.
        _overlay.Background = null;
        _body.Children.Add(_overlay);
        _overlay.SizeChanged += (_, _) => FitOverlay();

        BuildBrowserPanel();
        BuildBubble();
        FitOverlay();
    }

    private void BuildBubble()
    {
        _bubble.Content = "◎";
        _bubble.FontSize = 32;
        _bubble.FontWeight = FontWeights.Bold;
        _bubble.Foreground = Brushes.White;
        _bubble.Background = Paint("#225fc0");
        _bubble.BorderBrush = Brushes.White;
        _bubble.BorderThickness = new Thickness(2);
        _bubble.Width = 58;
        _bubble.Height = 58;
        _bubble.Cursor = Cursors.Hand;
        _bubble.ToolTip = "Open the native floating browser";
        _bubble.Click += async (_, _) => await OpenBrowserPanelAsync();
        _bubble.Visibility = Visibility.Visible;

        // Native bubble is deliberately fixed at top right, eliminating the
        // stale pointer-capture behaviour from the old iframe widget.
        _overlay.Children.Add(_bubble);
    }

    private void BuildBrowserPanel()
    {
        _browserPanel.Background = Brushes.White;
        _browserPanel.BorderBrush = Paint("#91b0d4");
        _browserPanel.BorderThickness = new Thickness(1);
        _browserPanel.CornerRadius = new CornerRadius(11);
        _browserPanel.Effect = new System.Windows.Media.Effects.DropShadowEffect
        {
            Color = Colors.Black, BlurRadius = 25, ShadowDepth = 5, Opacity = .22
        };
        _browserPanel.Visibility = Visibility.Collapsed;
        _browserPanel.ClipToBounds = true;

        var panelGrid = new Grid();
        panelGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(44) });
        panelGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(43) });
        panelGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(40) });
        panelGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        panelGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(28) });
        _browserPanel.Child = panelGrid;

        var titleStrip = new DockPanel { Background = Paint("#174888"), LastChildFill = true };
        Grid.SetRow(titleStrip, 0);
        panelGrid.Children.Add(titleStrip);

        var minimize = MakeButton("—", "#24589a", "#ffffff", 18, 38);
        minimize.Margin = new Thickness(0, 4, 7, 4);
        minimize.ToolTip = "Hide browser into the circular button (session stays open)";
        minimize.Click += (_, _) => MinimizeBrowser();
        DockPanel.SetDock(minimize, Dock.Right);
        titleStrip.Children.Add(minimize);

        var dragSurface = new Border
        {
            Background = Brushes.Transparent, Cursor = Cursors.SizeAll,
            Padding = new Thickness(13, 0, 0, 0),
            Child = Text("◉  Browser Workspace    •    drag this title bar", 13, "#ffffff", FontWeights.Bold)
        };
        titleStrip.Children.Add(dragSurface);
        WirePanelDrag(dragSurface);

        var addressRow = new Grid
        {
            Background = Paint("#f4f7fc"),
            Margin = new Thickness(9, 5, 9, 4)
        };
        addressRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        addressRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        addressRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        addressRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        addressRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetRow(addressRow, 1);
        panelGrid.Children.Add(addressRow);

        var back = MakeButton("‹", "#eaf1fa", "#245281", 20, 35);
        back.ToolTip = "Go back";
        back.Click += (_, _) => { if (_browserView.CoreWebView2?.CanGoBack == true) _browserView.CoreWebView2.GoBack(); };
        Grid.SetColumn(back, 0);
        addressRow.Children.Add(back);

        var forward = MakeButton("›", "#eaf1fa", "#245281", 20, 35);
        forward.ToolTip = "Go forward";
        forward.Click += (_, _) => { if (_browserView.CoreWebView2?.CanGoForward == true) _browserView.CoreWebView2.GoForward(); };
        Grid.SetColumn(forward, 1);
        addressRow.Children.Add(forward);

        var reload = MakeButton("↻", "#eaf1fa", "#245281", 18, 35);
        reload.ToolTip = "Reload page";
        reload.Click += (_, _) => _browserView.CoreWebView2?.Reload();
        Grid.SetColumn(reload, 2);
        addressRow.Children.Add(reload);

        _browserAddress.Text = SettingsStore.TryWebAddress(_preferences.BrowserUrl, out var initialUrl)
            ? initialUrl.AbsoluteUri : TelegramUrl;
        _browserAddress.Margin = new Thickness(0, 0, 7, 0);
        Grid.SetColumn(_browserAddress, 3);
        addressRow.Children.Add(_browserAddress);
        _browserAddress.KeyDown += async (_, e) =>
        {
            if (e.Key == Key.Enter) { await NavigateBrowserAsync(_browserAddress.Text); e.Handled = true; }
        };

        var go = MakeButton("Go", "#225fc0", "#ffffff", 12, 49);
        go.Click += async (_, _) => await NavigateBrowserAsync(_browserAddress.Text);
        Grid.SetColumn(go, 4);
        addressRow.Children.Add(go);

        var tools = new DockPanel
        {
            Background = Paint("#f4f7fc"),
            Margin = new Thickness(10, 0, 10, 3),
            LastChildFill = true
        };
        Grid.SetRow(tools, 2);
        panelGrid.Children.Add(tools);

        var telegram = MakeButton("Telegram Web", "#e3f0fe", "#23558a", 11, 119);
        telegram.Click += async (_, _) => await NavigateBrowserAsync(TelegramUrl);
        tools.Children.Add(telegram);
        DockPanel.SetDock(telegram, Dock.Left);

        var star = MakeButton("☆  Save", "#e3f0fe", "#23558a", 11, 84);
        star.Click += (_, _) => BookmarkCurrent();
        tools.Children.Add(star);
        DockPanel.SetDock(star, Dock.Left);

        _savedWebsites.Width = 215;
        _savedWebsites.Height = 32;
        _savedWebsites.Background = Brushes.White;
        _savedWebsites.Foreground = Paint("#234a78");
        _savedWebsites.FontSize = 11;
        _savedWebsites.VerticalAlignment = VerticalAlignment.Center;
        _savedWebsites.SelectionChanged += async (_, _) =>
        {
            if (_savedWebsites.SelectedItem is BookmarkItem item)
                await NavigateBrowserAsync(item.Url);
        };
        tools.Children.Add(_savedWebsites);
        RefreshBookmarks();

        _browserView.DefaultBackgroundColor = System.Drawing.Color.White;
        Grid.SetRow(_browserView, 3);
        panelGrid.Children.Add(_browserView);

        var foot = new Grid { Background = Paint("#eff4fb") };
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        foot.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        Grid.SetRow(foot, 4);
        panelGrid.Children.Add(foot);

        _notice.Text = "Native WebView2 • Login data remains on this device";
        _notice.Foreground = Paint("#5a6f88");
        _notice.FontSize = 10;
        _notice.VerticalAlignment = VerticalAlignment.Center;
        _notice.TextTrimming = TextTrimming.CharacterEllipsis;
        _notice.Margin = new Thickness(10, 0, 4, 0);
        foot.Children.Add(_notice);

        var grip = new Thumb
        {
            Width = 24, Height = 23, Cursor = Cursors.SizeNWSE,
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Bottom,
            Background = Paint("#aec4de"),
            ToolTip = "Drag to resize this browser"
        };
        grip.DragDelta += (_, e) =>
        {
            var minWidth = Math.Min(360, _overlay.ActualWidth - 18);
            var maxWidth = Math.Max(minWidth, _overlay.ActualWidth - Canvas.GetLeft(_browserPanel) - 8);
            var maxHeight = Math.Max(220, _overlay.ActualHeight - Canvas.GetTop(_browserPanel) - 8);
            _browserPanel.Width = Bound(_browserPanel.Width + e.HorizontalChange, minWidth, maxWidth);
            _browserPanel.Height = Bound(_browserPanel.Height + e.VerticalChange, 220, maxHeight);
        };
        grip.DragCompleted += (_, _) => RememberPanel();
        Grid.SetColumn(grip, 1);
        foot.Children.Add(grip);

        _overlay.Children.Add(_browserPanel);
    }

    private sealed record BookmarkItem(string Url, string Name)
    {
        public override string ToString() => Name;
    }

    private void RefreshBookmarks()
    {
        _savedWebsites.Items.Clear();
        foreach (var url in (_preferences.Bookmarks ?? new List<string>()).Take(15))
        {
            if (SettingsStore.TryWebAddress(url, out var uri))
                _savedWebsites.Items.Add(new BookmarkItem(uri.AbsoluteUri, uri.Host));
        }
        _savedWebsites.Text = "Saved websites";
    }

    private void BookmarkCurrent()
    {
        var url = SettingsStore.RememberableUrl(_browserAddress.Text);
        _preferences.Bookmarks ??= new List<string>();
        if (_preferences.Bookmarks.Contains(url))
        {
            _preferences.Bookmarks.Remove(url);
            _notice.Text = "Removed saved website";
        }
        else
        {
            _preferences.Bookmarks.Insert(0, url);
            _preferences.Bookmarks = _preferences.Bookmarks.Take(15).ToList();
            _notice.Text = "Website saved on this PC";
        }
        RefreshBookmarks();
        SettingsStore.Save(_preferences);
    }

    private void WirePanelDrag(Border surface)
    {
        surface.MouseLeftButtonDown += (_, e) =>
        {
            if (e.LeftButton != MouseButtonState.Pressed || !_panelOpen) return;
            _dragging = true;
            _dragFrom = e.GetPosition(_overlay);
            _panelFrom = new Point(Canvas.GetLeft(_browserPanel), Canvas.GetTop(_browserPanel));
            surface.CaptureMouse();
            e.Handled = true;
        };
        surface.MouseMove += (_, e) =>
        {
            if (!_dragging) return;
            if (e.LeftButton != MouseButtonState.Pressed) { EndPanelDrag(surface); return; }
            var current = e.GetPosition(_overlay);
            var x = _panelFrom.X + (current.X - _dragFrom.X);
            var y = _panelFrom.Y + (current.Y - _dragFrom.Y);
            Canvas.SetLeft(_browserPanel, Bound(x, 7, _overlay.ActualWidth - _browserPanel.Width - 7));
            Canvas.SetTop(_browserPanel, Bound(y, 7, _overlay.ActualHeight - _browserPanel.Height - 7));
        };
        surface.MouseLeftButtonUp += (_, _) => EndPanelDrag(surface);
        surface.LostMouseCapture += (_, _) => { _dragging = false; RememberPanel(); };
        Deactivated += (_, _) => EndPanelDrag(surface);
    }

    private void EndPanelDrag(Border surface)
    {
        if (!_dragging) return;
        _dragging = false;
        if (surface.IsMouseCaptured) surface.ReleaseMouseCapture();
        RememberPanel();
    }

    private static double Bound(double value, double minimum, double maximum) =>
        Math.Clamp(value, minimum, Math.Max(minimum, maximum));

    private void FitOverlay()
    {
        if (_overlay.ActualWidth < 100 || _overlay.ActualHeight < 100) return;
        Canvas.SetLeft(_bubble, _overlay.ActualWidth - _bubble.Width - 18);
        Canvas.SetTop(_bubble, 17);

        var maxW = Math.Max(320, _overlay.ActualWidth - 16);
        var maxH = Math.Max(230, _overlay.ActualHeight - 16);
        _browserPanel.Width = Bound(
            _browserPanel.Width > 0 ? _browserPanel.Width : _preferences.PanelWidth,
            Math.Min(330, maxW), maxW);
        _browserPanel.Height = Bound(
            _browserPanel.Height > 0 ? _browserPanel.Height : _preferences.PanelHeight,
            Math.Min(230, maxH), maxH);
        var preferredX = Canvas.GetLeft(_browserPanel);
        if (double.IsNaN(preferredX)) preferredX = _preferences.PanelX;
        if (preferredX < 0) preferredX = _overlay.ActualWidth - _browserPanel.Width - 20;
        var preferredY = Canvas.GetTop(_browserPanel);
        if (double.IsNaN(preferredY)) preferredY = _preferences.PanelY;
        Canvas.SetLeft(_browserPanel, Bound(preferredX, 8, _overlay.ActualWidth - _browserPanel.Width - 8));
        Canvas.SetTop(_browserPanel, Bound(preferredY, 8, _overlay.ActualHeight - _browserPanel.Height - 8));
    }

    private void RememberPanel()
    {
        if (_overlay.ActualWidth < 100 || _overlay.ActualHeight < 100) return;
        _preferences.PanelWidth = _browserPanel.Width;
        _preferences.PanelHeight = _browserPanel.Height;
        _preferences.PanelX = Canvas.GetLeft(_browserPanel);
        _preferences.PanelY = Canvas.GetTop(_browserPanel);
        SettingsStore.Save(_preferences);
    }

    private async Task InitializeInvoiceAsync()
    {
        try
        {
            _invoiceStatus.Text = "Initializing invoice WebView2…";
            var environment = await CoreWebView2Environment.CreateAsync(
                null, SettingsStore.InvoiceProfile);
            await _invoiceView.EnsureCoreWebView2Async(environment);
            var web = _invoiceView.CoreWebView2;
            web.Settings.AreDevToolsEnabled = false;
            web.Settings.AreHostObjectsAllowed = false;
            web.Settings.IsStatusBarEnabled = false;
            await web.AddScriptToExecuteOnDocumentCreatedAsync(HideWebInvoiceBubbleScript);
            web.NavigationCompleted += async (_, e) =>
            {
                _invoiceStatus.Text = e.IsSuccess ? "Invoice loaded" : "Invoice connection failed";
                try { await web.ExecuteScriptAsync(HideWebInvoiceBubbleScript); }
                catch { /* This may occur during navigation. */ }
            };
            NavigateInvoice();
        }
        catch (Exception e)
        {
            _invoiceStatus.Text = "Invoice WebView2 setup failed";
            MessageBox.Show("Invoice page could not open: " + e.Message +
                "\n\nInstall or repair Microsoft Edge WebView2 Runtime and try again.",
                "BIG BROTHER — Test Workstation", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private void NavigateInvoice()
    {
        if (!SettingsStore.TryWebAddress(_invoiceAddress.Text, out var url))
        {
            _invoiceStatus.Text = "Invalid invoice URL";
            return;
        }
        _preferences.InvoiceUrl = SettingsStore.RememberableUrl(url.AbsoluteUri);
        SettingsStore.Save(_preferences);
        if (_invoiceView.CoreWebView2 == null) return;
        // Deliberate navigation: not called when minimizing the browser.
        _invoiceView.CoreWebView2.Navigate(url.AbsoluteUri);
        _invoiceStatus.Text = "Loading invoice…";
    }

    private async Task OpenBrowserPanelAsync()
    {
        _panelOpen = true;
        _browserPanel.Visibility = Visibility.Visible;
        _bubble.Visibility = Visibility.Collapsed;
        FitOverlay();
        if (_browserReady || _browserStarting) return;
        _browserStarting = true;
        _notice.Text = "Starting native WebView2 browser…";
        try
        {
            var environment = await CoreWebView2Environment.CreateAsync(
                null, SettingsStore.BrowserProfile);
            await _browserView.EnsureCoreWebView2Async(environment);
            var web = _browserView.CoreWebView2;
            web.Settings.AreHostObjectsAllowed = false;
            web.Settings.AreDevToolsEnabled = false;
            web.Settings.IsStatusBarEnabled = false;
            web.NewWindowRequested += (_, e) =>
            {
                // Most sites use same-page browsing. Keep links in the native
                // browser rather than opening an external Chrome window.
                if (SettingsStore.TryWebAddress(e.Uri, out var target))
                {
                    e.Handled = true;
                    web.Navigate(target.AbsoluteUri);
                }
            };
            web.NavigationCompleted += (_, e) =>
            {
                if (SettingsStore.TryWebAddress(web.Source, out var current))
                {
                    _browserAddress.Text = current.AbsoluteUri;
                    _preferences.BrowserUrl = SettingsStore.RememberableUrl(current.AbsoluteUri);
                    SettingsStore.Save(_preferences);
                }
                _notice.Text = e.IsSuccess
                    ? "WebView2 browser • Private device profile retained"
                    : "Website navigation failed; check the address or your connection";
            };
            _browserReady = true;
            await NavigateBrowserAsync(_browserAddress.Text);
        }
        catch (Exception e)
        {
            _notice.Text = "Native browser failed to start";
            MessageBox.Show("Native browser unavailable: " + e.Message +
                "\n\nMicrosoft Edge WebView2 Runtime is required.",
                "BIG BROTHER — Test Workstation", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
        finally
        {
            _browserStarting = false;
        }
    }

    private async Task NavigateBrowserAsync(string requestedUrl)
    {
        if (!SettingsStore.TryWebAddress(requestedUrl, out var url))
        {
            _notice.Text = "Enter an http:// or https:// website address";
            return;
        }

        _browserAddress.Text = url.AbsoluteUri;
        _preferences.BrowserUrl = SettingsStore.RememberableUrl(url.AbsoluteUri);
        SettingsStore.Save(_preferences);
        if (!_browserReady)
        {
            if (!_browserStarting) await OpenBrowserPanelAsync();
            return;
        }

        // The external website is a TOP-LEVEL document, not an iframe.
        _browserView.CoreWebView2.Navigate(url.AbsoluteUri);
        _notice.Text = "Navigating to " + url.Host + "…";
    }

    private void MinimizeBrowser()
    {
        RememberPanel();
        _panelOpen = false;
        _dragging = false;
        _browserPanel.Visibility = Visibility.Collapsed;
        _bubble.Visibility = Visibility.Visible;
        // Keep the same WebView2 instance alive: no Dispose, no Navigate,
        // no profile wipe, no page reload, no invoice state changes.
    }
}
