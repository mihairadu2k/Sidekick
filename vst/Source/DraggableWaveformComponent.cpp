#include "DraggableWaveformComponent.h"

DraggableWaveformComponent::DraggableWaveformComponent(juce::AudioFormatManager& fm)
    : formatManager(fm),
      thumbnail(512, formatManager, thumbnailCache)
{
    thumbnail.addChangeListener(this);
    setMouseCursor(juce::MouseCursor::DraggingHandCursor);
    setTooltip("Drag this waveform directly onto your Ableton Live arrangement or FL Studio playlist!");
}

DraggableWaveformComponent::~DraggableWaveformComponent()
{
    thumbnail.removeChangeListener(this);
}

void DraggableWaveformComponent::setAudioFile(const juce::File& file, const juce::String& title, const juce::String& artist)
{
    currentAudioFile = file;
    displayTitle = title.isNotEmpty() ? title : file.getFileNameWithoutExtension();
    displayArtist = artist;

    if (file.existsAsFile())
    {
        std::unique_ptr<juce::AudioFormatReader> reader(formatManager.createReaderFor(file));
        if (reader != nullptr)
        {
            auto durationSec = static_cast<int>(reader->lengthInSamples / std::max(1.0, reader->sampleRate));
            int mins = durationSec / 60;
            int secs = durationSec % 60;
            durationStr = juce::String::formatted("%d:%02d", mins, secs);
        }
        else
        {
            durationStr = "";
        }

        thumbnail.setSource(new juce::FileInputSource(file));
    }
    else
    {
        thumbnail.clear();
        durationStr = "";
    }

    repaint();
}

void DraggableWaveformComponent::clear()
{
    currentAudioFile = juce::File();
    displayTitle = "";
    displayArtist = "";
    durationStr = "";
    isPlaying = false;
    thumbnail.clear();
    repaint();
}

void DraggableWaveformComponent::setPlayingState(bool playing)
{
    if (isPlaying != playing)
    {
        isPlaying = playing;
        repaint();
    }
}

void DraggableWaveformComponent::changeListenerCallback(juce::ChangeBroadcaster* source)
{
    if (source == &thumbnail)
        repaint();
}

void DraggableWaveformComponent::paint(juce::Graphics& g)
{
    auto bounds = getLocalBounds().toFloat().reduced(2.0f);

    // Background Card
    juce::Colour bgStart = juce::Colour(0xff161927);
    juce::Colour bgEnd = juce::Colour(0xff0d0f17);
    juce::ColourGradient bgGrad(bgStart, bounds.getCentreX(), bounds.getY(),
                                bgEnd, bounds.getCentreX(), bounds.getBottom(), false);
    g.setGradientFill(bgGrad);
    g.fillRoundedRectangle(bounds, 8.0f);

    // Border
    juce::Colour borderColor = isHovered ? juce::Colour(0xff38bdf8) : juce::Colour(0xff2a324b);
    g.setColour(borderColor);
    g.drawRoundedRectangle(bounds, 8.0f, isHovered ? 1.5f : 1.0f);

    if (!hasFile())
    {
        // Empty placeholder state
        g.setColour(juce::Colour(0xff64748b));
        g.setFont(juce::Font(13.0f, juce::Font::plain));
        g.drawFittedText("Audio waveform & drag handle will appear here after conversion",
                          bounds.toNearestInt(), juce::Justification::centred, 2);
        return;
    }

    // Waveform Area
    auto waveArea = bounds.reduced(10.0f);
    waveArea.removeFromTop(24.0f); // Space for title header
    waveArea.removeFromBottom(22.0f); // Space for drag prompt

    if (thumbnail.getTotalLength() > 0.0)
    {
        juce::Colour waveTop = juce::Colour(0xff38bdf8);
        juce::Colour waveBottom = juce::Colour(0xff818cf8);
        juce::ColourGradient waveGrad(waveTop, waveArea.getCentreX(), waveArea.getY(),
                                      waveBottom, waveArea.getCentreX(), waveArea.getBottom(), false);
        g.setGradientFill(waveGrad);
        thumbnail.drawChannel(g, waveArea.toNearestInt(), 0.0, thumbnail.getTotalLength(), 0, 0.95f);
    }
    else
    {
        g.setColour(juce::Colour(0xff38bdf8).withAlpha(0.4f));
        g.drawFittedText("Loading waveform...", waveArea.toNearestInt(), juce::Justification::centred, 1);
    }

    // Header: Title, Artist, Duration, Format Badge
    auto headerArea = bounds.reduced(10.0f, 6.0f);
    headerArea.setHeight(22.0f);

    // Format badge on right
    auto formatStr = currentAudioFile.getFileExtension().replace(".", "").toUpperCase();
    auto badgeWidth = 42.0f;
    auto badgeArea = headerArea.removeFromRight(badgeWidth);
    g.setColour(juce::Colour(0xff0284c7).withAlpha(0.3f));
    g.fillRoundedRectangle(badgeArea, 4.0f);
    g.setColour(juce::Colour(0xff38bdf8));
    g.drawRoundedRectangle(badgeArea, 4.0f, 1.0f);
    g.setFont(juce::Font(10.0f, juce::Font::bold));
    g.drawFittedText(formatStr, badgeArea.toNearestInt(), juce::Justification::centred, 1);

    headerArea.removeFromRight(6.0f);

    // Duration on right
    if (durationStr.isNotEmpty())
    {
        auto durWidth = 45.0f;
        auto durArea = headerArea.removeFromRight(durWidth);
        g.setColour(juce::Colour(0xff94a3b8));
        g.setFont(juce::Font(11.0f, juce::Font::plain));
        g.drawFittedText(durationStr, durArea.toNearestInt(), juce::Justification::centredRight, 1);
        headerArea.removeFromRight(6.0f);
    }

    // Play/Pause icon button area on left of header
    auto playBtnArea = headerArea.removeFromLeft(20.0f);
    g.setColour(isPlaying ? juce::Colour(0xffef4444) : juce::Colour(0xff22c55e));
    if (isPlaying)
    {
        // Draw Stop Square
        g.fillRect(playBtnArea.reduced(5.0f));
    }
    else
    {
        // Draw Play Triangle
        juce::Path playPath;
        playPath.addTriangle(playBtnArea.getX() + 5.0f, playBtnArea.getY() + 4.0f,
                             playBtnArea.getX() + 5.0f, playBtnArea.getBottom() - 4.0f,
                             playBtnArea.getRight() - 4.0f, playBtnArea.getCentreY());
        g.fillPath(playPath);
    }

    headerArea.removeFromLeft(6.0f);

    // Title & Artist
    g.setColour(juce::Colour(0xfff8fafc));
    g.setFont(juce::Font(12.0f, juce::Font::bold));
    juce::String fullText = displayTitle;
    if (displayArtist.isNotEmpty() && displayArtist != "Unknown Artist")
        fullText = displayArtist + " - " + displayTitle;

    g.drawFittedText(fullText, headerArea.toNearestInt(), juce::Justification::centredLeft, 1);

    // Bottom Bar: Drag Prompt Pill
    auto bottomArea = bounds.reduced(10.0f, 6.0f);
    bottomArea = bottomArea.withY(bounds.getBottom() - 26.0f).withHeight(20.0f);

    juce::Colour pillBg = isHovered ? juce::Colour(0xff0284c7) : juce::Colour(0xff1e293b);
    g.setColour(pillBg);
    g.fillRoundedRectangle(bottomArea, 5.0f);

    g.setColour(isHovered ? juce::Colour(0xffffffff) : juce::Colour(0xff38bdf8));
    g.setFont(juce::Font(11.0f, juce::Font::bold));
    g.drawFittedText(isDragging ? "[DRAGGING TO DAW TIMELINE...]" : "[+] DRAG DIRECTLY ONTO TIMELINE / TRACK",
                     bottomArea.toNearestInt(), juce::Justification::centred, 1);
}

void DraggableWaveformComponent::resized()
{
}

void DraggableWaveformComponent::mouseEnter(const juce::MouseEvent&)
{
    isHovered = true;
    repaint();
}

void DraggableWaveformComponent::mouseExit(const juce::MouseEvent&)
{
    isHovered = false;
    repaint();
}

void DraggableWaveformComponent::mouseDown(const juce::MouseEvent& e)
{
    dragStartPos = e.getPosition();
    isDragging = false;

    // Check if clicked in play button area (top left)
    auto bounds = getLocalBounds().toFloat().reduced(2.0f);
    auto headerArea = bounds.reduced(10.0f, 6.0f);
    headerArea.setHeight(22.0f);
    auto playBtnArea = headerArea.removeFromLeft(26.0f);

    if (playBtnArea.contains(e.position) && hasFile())
    {
        if (onPreviewToggle)
            onPreviewToggle(currentAudioFile, !isPlaying);
    }
}

void DraggableWaveformComponent::mouseDrag(const juce::MouseEvent& e)
{
    if (hasFile() && !isDragging && (e.getPosition() - dragStartPos).getDistanceFromOrigin() > 6)
    {
        isDragging = true;
        repaint();

        juce::StringArray files;
        files.add(currentAudioFile.getFullPathName());

        juce::DragAndDropContainer::performExternalDragDropOfFiles(files, false, this, [this]() {
            isDragging = false;
            repaint();
        });
    }
}

void DraggableWaveformComponent::mouseUp(const juce::MouseEvent&)
{
    isDragging = false;
    repaint();
}
