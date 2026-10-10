#include "PluginEditor.h"

YT2MP3AudioProcessorEditor::YT2MP3AudioProcessorEditor(YT2MP3AudioProcessor& p)
    : AudioProcessorEditor(&p),
      audioProcessor(p),
      progressBar(progressValue),
      waveformComponent(p.getFormatManager())
{
    setSize(520, 390);

    // Header Title
    headerTitleLabel.setText("YT2MP3 PRO", juce::dontSendNotification);
    headerTitleLabel.setFont(juce::Font(16.0f, juce::Font::bold));
    headerTitleLabel.setColour(juce::Label::textColourId, juce::Colour(0xfff8fafc));
    addAndMakeVisible(headerTitleLabel);

    // Status Label
    statusLabel.setFont(juce::Font(11.0f, juce::Font::plain));
    statusLabel.setJustificationType(juce::Justification::centredRight);
    addAndMakeVisible(statusLabel);

    // URL Text Editor
    urlEditor.setTextToShowWhenEmpty("Paste YouTube URL (e.g. https://www.youtube.com/watch?v=...)", juce::Colour(0xff64748b));
    urlEditor.setColour(juce::TextEditor::backgroundColourId, juce::Colour(0xff161927));
    urlEditor.setColour(juce::TextEditor::textColourId, juce::Colour(0xfff8fafc));
    urlEditor.setColour(juce::TextEditor::outlineColourId, juce::Colour(0xff2a324b));
    urlEditor.setColour(juce::TextEditor::focusedOutlineColourId, juce::Colour(0xff38bdf8));
    urlEditor.setFont(juce::Font(12.0f, juce::Font::plain));
    urlEditor.onReturnKey = [this]() { triggerDownload(); };
    addAndMakeVisible(urlEditor);

    // Paste Button
    pasteButton.setColour(juce::TextButton::buttonColourId, juce::Colour(0xff1e293b));
    pasteButton.setColour(juce::TextButton::textColourOffId, juce::Colour(0xff94a3b8));
    pasteButton.onClick = [this]() {
        auto clipboardText = juce::SystemClipboard::getTextFromClipboard();
        if (clipboardText.contains("youtube.com") || clipboardText.contains("youtu.be"))
        {
            urlEditor.setText(clipboardText.trim());
        }
    };
    addAndMakeVisible(pasteButton);

    // Quality Combo Box
    qualityComboBox.addItem("320k (Studio MP3)", 1);
    qualityComboBox.addItem("256k MP3", 2);
    qualityComboBox.addItem("192k MP3", 3);
    qualityComboBox.addItem("WAV (Lossless)", 4);
    qualityComboBox.addItem("FLAC (Lossless)", 5);
    qualityComboBox.setSelectedId(1);
    qualityComboBox.setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff161927));
    qualityComboBox.setColour(juce::ComboBox::textColourId, juce::Colour(0xffcbd5e1));
    qualityComboBox.setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff2a324b));
    addAndMakeVisible(qualityComboBox);

    // Convert Button
    convertButton.setColour(juce::TextButton::buttonColourId, juce::Colour(0xff0284c7));
    convertButton.setColour(juce::TextButton::textColourOffId, juce::Colour(0xffffffff));
    convertButton.onClick = [this]() { triggerDownload(); };
    addAndMakeVisible(convertButton);

    // Progress Bar
    progressBar.setColour(juce::ProgressBar::backgroundColourId, juce::Colour(0xff161927));
    progressBar.setColour(juce::ProgressBar::foregroundColourId, juce::Colour(0xff38bdf8));
    addAndMakeVisible(progressBar);
    progressBar.setVisible(false);

    // Info Status Label
    infoStatusLabel.setFont(juce::Font(11.0f, juce::Font::plain));
    infoStatusLabel.setColour(juce::Label::textColourId, juce::Colour(0xff94a3b8));
    infoStatusLabel.setJustificationType(juce::Justification::centredLeft);
    infoStatusLabel.setText("Ready to download audio straight to your DAW timeline", juce::dontSendNotification);
    addAndMakeVisible(infoStatusLabel);

    // Waveform & Drag Component
    waveformComponent.onPreviewToggle = [this](const juce::File& file, bool shouldPlay) {
        if (shouldPlay)
        {
            audioProcessor.playPreview(file);
            waveformComponent.setPlayingState(true);
        }
        else
        {
            audioProcessor.stopPreview();
            waveformComponent.setPlayingState(false);
        }
    };
    addAndMakeVisible(waveformComponent);

    // Recent Downloads Combo Box
    recentFilesComboBox.setTextWhenNothingSelected("Recent Project Downloads...");
    recentFilesComboBox.setColour(juce::ComboBox::backgroundColourId, juce::Colour(0xff161927));
    recentFilesComboBox.setColour(juce::ComboBox::textColourId, juce::Colour(0xffcbd5e1));
    recentFilesComboBox.setColour(juce::ComboBox::outlineColourId, juce::Colour(0xff2a324b));
    recentFilesComboBox.onChange = [this]() {
        loadSelectedFileIntoWaveform(recentFilesComboBox.getSelectedId() - 1);
    };
    addAndMakeVisible(recentFilesComboBox);

    // Open Folder Button
    openFolderButton.setColour(juce::TextButton::buttonColourId, juce::Colour(0xff1e293b));
    openFolderButton.setColour(juce::TextButton::textColourOffId, juce::Colour(0xff94a3b8));
    openFolderButton.onClick = [this]() {
        juce::File downloadsDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                                      .getChildFile("Work/YT2MP3/downloads");
        if (!downloadsDir.isDirectory())
            downloadsDir.createDirectory();
        downloadsDir.revealToUser();
    };
    addAndMakeVisible(openFolderButton);

    // Register listeners
    audioProcessor.getBackendClient().addListener(this);
    updateConnectionStatusUI();
    audioProcessor.getBackendClient().refreshFilesList();

    startTimerHz(10); // 10 fps UI update for transport & progress
}

YT2MP3AudioProcessorEditor::~YT2MP3AudioProcessorEditor()
{
    stopTimer();
    audioProcessor.getBackendClient().removeListener(this);
}

void YT2MP3AudioProcessorEditor::paint(juce::Graphics& g)
{
    // Background Dark Studio Canvas
    g.fillAll(juce::Colour(0xff090b10));

    // Subtle card background for input section
    auto bounds = getLocalBounds().toFloat();
    auto inputSection = bounds.reduced(14.0f, 12.0f);
    inputSection.removeFromTop(36.0f);
    inputSection.setHeight(84.0f);

    g.setColour(juce::Colour(0xff121520));
    g.fillRoundedRectangle(inputSection, 6.0f);
    g.setColour(juce::Colour(0xff1e293b));
    g.drawRoundedRectangle(inputSection, 6.0f, 1.0f);

    // Status dot
    auto dotArea = getLocalBounds().reduced(16, 14);
    dotArea.removeFromLeft(120);
    dotArea.setWidth(8);
    dotArea.setHeight(8);
    dotArea.setY(18);

    g.setColour(isConnected ? juce::Colour(0xff22c55e) : juce::Colour(0xffef4444));
    g.fillEllipse(dotArea.toFloat());
}

void YT2MP3AudioProcessorEditor::resized()
{
    auto bounds = getLocalBounds().reduced(14, 12);

    // Header (Row 1)
    auto headerArea = bounds.removeFromTop(28);
    headerTitleLabel.setBounds(headerArea.removeFromLeft(115));
    headerArea.removeFromLeft(15);
    statusLabel.setBounds(headerArea);

    bounds.removeFromTop(8);

    // Input Box (Row 2 & 3)
    auto inputRow1 = bounds.removeFromTop(34);
    pasteButton.setBounds(inputRow1.removeFromRight(64).reduced(0, 2));
    inputRow1.removeFromRight(6);
    urlEditor.setBounds(inputRow1.reduced(0, 2));

    bounds.removeFromTop(6);

    auto inputRow2 = bounds.removeFromTop(34);
    convertButton.setBounds(inputRow2.removeFromRight(120).reduced(0, 2));
    inputRow2.removeFromRight(8);
    qualityComboBox.setBounds(inputRow2.removeFromRight(150).reduced(0, 2));

    bounds.removeFromTop(8);

    // Progress bar & status label
    auto progressArea = bounds.removeFromTop(22);
    infoStatusLabel.setBounds(progressArea);
    progressBar.setBounds(progressArea);

    bounds.removeFromTop(8);

    // Recent Files row at bottom
    auto bottomRow = bounds.removeFromBottom(28);
    openFolderButton.setBounds(bottomRow.removeFromRight(100).reduced(0, 1));
    bottomRow.removeFromRight(8);
    recentFilesComboBox.setBounds(bottomRow.reduced(0, 1));

    bounds.removeFromBottom(8);

    // Waveform Component occupies remaining space
    waveformComponent.setBounds(bounds);
}

void YT2MP3AudioProcessorEditor::timerCallback()
{
    // Sync preview playing state with processor transport
    if (!audioProcessor.isPlayingPreview() && waveformComponent.hasFile())
    {
        waveformComponent.setPlayingState(false);
    }
}

void YT2MP3AudioProcessorEditor::updateConnectionStatusUI()
{
    isConnected = audioProcessor.getBackendClient().isConnected();
    if (isConnected)
    {
        statusLabel.setText("Backend: 127.0.0.1:8000 (Connected)", juce::dontSendNotification);
        statusLabel.setColour(juce::Label::textColourId, juce::Colour(0xff22c55e));
    }
    else
    {
        statusLabel.setText("Backend Offline (Run ./run.sh)", juce::dontSendNotification);
        statusLabel.setColour(juce::Label::textColourId, juce::Colour(0xffef4444));
    }
    repaint();
}

void YT2MP3AudioProcessorEditor::triggerDownload()
{
    auto url = urlEditor.getText().trim();
    if (url.isEmpty())
        return;

    juce::String quality = "320k";
    switch (qualityComboBox.getSelectedId())
    {
        case 1: quality = "320k"; break;
        case 2: quality = "256k"; break;
        case 3: quality = "192k"; break;
        case 4: quality = "wav"; break;
        case 5: quality = "flac"; break;
        default: quality = "320k"; break;
    }

    infoStatusLabel.setVisible(true);
    infoStatusLabel.setText("Connecting to YouTube...", juce::dontSendNotification);
    convertButton.setEnabled(false);

    audioProcessor.getBackendClient().startDownload(url, quality);
}

void YT2MP3AudioProcessorEditor::backendConnectionChanged(bool connected)
{
    updateConnectionStatusUI();
}

void YT2MP3AudioProcessorEditor::downloadStarted(const juce::String&)
{
    convertButton.setEnabled(false);
    progressBar.setVisible(true);
    progressValue = 0.0;
    infoStatusLabel.setText("Starting download...", juce::dontSendNotification);
}

void YT2MP3AudioProcessorEditor::downloadFailed(const juce::String& err)
{
    convertButton.setEnabled(true);
    progressBar.setVisible(false);
    infoStatusLabel.setText("Error: " + err, juce::dontSendNotification);
    infoStatusLabel.setColour(juce::Label::textColourId, juce::Colour(0xffef4444));
}

void YT2MP3AudioProcessorEditor::taskUpdated(const BackendTask& task)
{
    if (task.status == "downloading")
    {
        progressBar.setVisible(true);
        progressValue = task.progress / 100.0;
        juce::String text = juce::String::formatted("Downloading: %.0f%%", task.progress);
        if (task.speed.isNotEmpty())
            text += " (" + task.speed + ")";
        if (task.eta.isNotEmpty())
            text += " ETA: " + task.eta;
        infoStatusLabel.setText(text, juce::dontSendNotification);
    }
    else if (task.status == "converting")
    {
        progressBar.setVisible(false);
        infoStatusLabel.setText("Converting audio & tagging ID3...", juce::dontSendNotification);
    }
    else if (task.status == "completed")
    {
        convertButton.setEnabled(true);
        progressBar.setVisible(false);
        infoStatusLabel.setText("Completed! Drag waveform directly to timeline below", juce::dontSendNotification);
        infoStatusLabel.setColour(juce::Label::textColourId, juce::Colour(0xff22c55e));

        juce::File audioFile(task.filePath);
        if (!audioFile.existsAsFile() && task.filename.isNotEmpty())
        {
            audioFile = juce::File::getSpecialLocation(juce::File::userHomeDirectory)
                            .getChildFile("Work/YT2MP3/downloads")
                            .getChildFile(task.filename);
        }

        if (audioFile.existsAsFile())
        {
            waveformComponent.setAudioFile(audioFile, task.title, task.artist);
        }
    }
    else if (task.status == "error")
    {
        convertButton.setEnabled(true);
        progressBar.setVisible(false);
        infoStatusLabel.setText("Failed: " + task.error, juce::dontSendNotification);
        infoStatusLabel.setColour(juce::Label::textColourId, juce::Colour(0xffef4444));
    }
}

void YT2MP3AudioProcessorEditor::filesListUpdated(const juce::Array<BackendFileItem>& files)
{
    currentFiles = files;
    recentFilesComboBox.clear(juce::dontSendNotification);

    for (int i = 0; i < files.size(); ++i)
    {
        auto title = files[i].title;
        if (files[i].artist.isNotEmpty() && files[i].artist != "Unknown Artist")
            title = files[i].artist + " - " + title;
        title += " (" + files[i].format + ")";
        recentFilesComboBox.addItem(title, i + 1);
    }

    // If waveform is currently empty and files exist, load latest file
    if (!waveformComponent.hasFile() && !files.isEmpty())
    {
        loadSelectedFileIntoWaveform(0);
    }
}

void YT2MP3AudioProcessorEditor::loadSelectedFileIntoWaveform(int index)
{
    if (index >= 0 && index < currentFiles.size())
    {
        const auto& item = currentFiles[index];
        juce::File file(item.filePath);
        if (file.existsAsFile())
        {
            waveformComponent.setAudioFile(file, item.title, item.artist);
            infoStatusLabel.setText("Loaded: " + item.title + " (Drag directly to timeline)", juce::dontSendNotification);
            infoStatusLabel.setColour(juce::Label::textColourId, juce::Colour(0xff94a3b8));
        }
    }
}
